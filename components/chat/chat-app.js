import {notify, importLink} from '../../js/std-js/functions.js';
import {confirm, prompt} from '../../js/std-js/asyncDialog.js';
import '../chat-log/chat-log.js';
import '../chat-message/chat-message.js';

async function requirePrompt(text, {initial = '', test = resp => resp !== ''} = {}) {
	let valid = false, resp = '';
	while (! valid) {
		resp = await prompt(text, initial);
		if (! (test instanceof Function) || test(resp)) {
			valid = true;
		}
	}
	return resp;
}

export default class HTMLChatAppElement extends HTMLElement {
	constructor() {
		super();
		this.socket = undefined;
		this.addEventListener('connect', () => {
			const onlineIcon = this.header.querySelector('slot[name="online-icon"]');
			const offlineIcon = this.header.querySelector('slot[name="offline-icon"]');
			onlineIcon.hidden = false;
			offlineIcon.hidden = true;
			if (this.name !== null) {
				this.socket.send(JSON.stringify({event: 'introduce', name: this.name}));
			}
		});
		this.addEventListener('disconnect', () => {
			const onlineIcon = this.header.querySelector('slot[name="online-icon"]');
			const offlineIcon = this.header.querySelector('slot[name="offline-icon"]');
			onlineIcon.hidden = true;
			offlineIcon.hidden = false;
		});
		const shadow = this.attachShadow({mode: 'closed'});
		importLink('chat-app-template').then(async link => {
			await customElements.whenDefined('chat-log');
			[...link.head.children].forEach(child => shadow.append(child.cloneNode(true)));
			[...link.body.children].forEach(child => shadow.append(child.cloneNode(true)));
			this.header = shadow.querySelector('chat-header');
			this.messageContainer = shadow.querySelector('chat-log');
			this.nameInput = shadow.querySelector('input[name="from"]');
			shadow.querySelector('[data-click="exit"]').addEventListener('click', async event => {
				event.stopPropagation();
				if (await confirm('Are you sure you want to close this chat?')) {
					if (this.socket instanceof WebSocket) {
						this.disconnect();
						this.label = 'Offline';
					}
				}
			});
			shadow.querySelector('[name="attachment"]').addEventListener('change', event => {
				const files = event.target.files;
				const hasAttachment = (files instanceof FileList) && [...files].some(file => file.size !== 0);
				event.target.form.querySelector('[name="text"]').required = ! hasAttachment;
				event.target.form.classList.toggle('has-attachment', hasAttachment);
			}, {
				passive: true,
			});
			shadow.querySelector('form').addEventListener('submit', async event => {
				event.preventDefault();
				await this.connected;
				const form = new FormData(event.target);
				const data = Object.fromEntries(form.entries());
				event.target.reset();

				if (data.attachment instanceof File && data.attachment.size !== 0) {
					await this.attach(data);
				} else {
					data.time = new Date();
					await this.messageContainer.addMessage({text: data.text, action: 'sent', date: data.time, from: data.from});
					await this.send(data);
					this.dispatchEvent(new CustomEvent('message-sent', {detail: data}));
				}
			});
			shadow.querySelector('form').addEventListener('reset', event => {
				event.target.classList.remove('has-attachment');
				event.target.querySelector('[name="text"]').required = true;
			}, {
				passive: true,
			});
			this.body = shadow.querySelector('.chat-body');
			this.dispatchEvent(new Event('load'));
			this.header.addEventListener('click', () => {
				if (this.socket instanceof WebSocket) {
					this.toggleAttribute('open');
				} else {
					this.connect();
				}
			});
		});

		this.addEventListener('message-received', async event => {
			await this.connected;
			this.messageContainer.addMessage({text: event.detail.text, from: event.detail.from, action: 'received'});
			if (document.visibilityState !== 'visible' || ! this.open) {
				const notification = await notify('Message Received', {
					body: event.detail.text,
					icon: new URL('img/chat.svg', document.baseURI),
				});
				notification.addEventListener('click', () => this.open = true);
			}
		});

		this.addEventListener('attachment', async event => {
			await this.connected;
			this.messageContainer.addAttachment(event.detail);
			if (event.detail.action === 'received' && document.visibilityState !== 'visible' || ! this.open) {
				let {name, data} = event.detail;
				const notification = await notify('Attachment Received', {
					body: name,
					icon: data,
				});
				notification.addEventListener('click', () => this.open = true);
			}
		});
	}

	disconnectedCallback() {
		if (this.socket instanceof WebSocket) {
			this.socket.close();
			this.socket = undefined;
		}
	}

	toJSON() {
		return this.messages;
	}

	async paired() {
		await new Promise(async resolve => {
			if ((this.socket instanceof WebSocket) && this.socket.paired === true) {
				resolve();
			} else {
				await this.connected;
				this.socket.paired = true;
				this.addEventListener('paired', () => resolve(), {once: true});
			}
		});
		this.dispatchEvent(new Event('paired'));
	}

	disconnect() {
		if (this.socket instanceof WebSocket) {
			this.socket.close();
			return true;
		} else {
			return false;
		}
	}

	async connect() {
		await new Promise(async (resolve, reject) => {
			if (this.name === null) {
				this.name = await requirePrompt('Please enter your name.');
			}

			if (! (this.socket instanceof WebSocket)) {
				this.label = 'Waiting for connection';
				this.socket = new WebSocket(this.src);

				this.socket.addEventListener('close', async event => {
					this.socket = undefined;
					this.open = false;
					this.dispatchEvent(new Event('disconnect'));
					notify('Connection closed', {
						body: event.reason || 'Click to to reconnect',
					});
				});

				this.socket.addEventListener('message', async msg => {
					if (typeof msg.data !== 'string') {
						return;
					}
					const json = JSON.parse(msg.data);
					switch (json.event) {
					case 'message':
						let {message, contentType = 'text/plain', time = new Date(), from = this.name} = JSON.parse(msg.data);
						this.dispatchEvent(new CustomEvent('message-received', {detail: {
							text: message,
							contentType,
							time,
							from,
						}}));
						break;
					case 'attachment':
						try {
							let {size, contentType, time, data, name, text = '', action = 'received', from = this.name} = json;
							this.dispatchEvent(new CustomEvent('attachment', {detail: {size, contentType, time, data, name, text, action, from}}));
						} catch (err) {
							console.error(err);
						}
						break;
					case 'paired':
						this.dispatchEvent(new Event('paired'));
						break;
					case 'prompt':
						const {text, initial = ''} = json;
						this.socket.send(await requirePrompt(text, {initial}));
						break;

					case 'introduce':
						this.label = json.name;
						break;
					case 'notify':
						const {title, body, icon = new URL('img/chat.svg', document.baseURI)} = json;
						notify(title, {body, icon});
						break;
					case 'meta':
						if ('label' in json) {
							this.label = json.label;
						}
						if ('header-background' in json)  {
							this.headerBackground = json['header-background'];
						}
						if ('header-color' in json) {
							this.headerColor = json['header-color'];
						}
						break;
					case 'hide':
						this.hidden = true;
						break;
					case 'show':
						this.hidden = false;
						break;
					case 'open':
						open(json.url);
						break;
					case 'log':
						console.log(json.data);
						break;
					case 'info':
						console.info(json.data);
						break;
					case 'table':
						console.table(json.data);
						break;
					case 'warn':
						console.warn(json.data);
						break;
					case 'error':
						console.error(json.data);
						break;
					default: throw new Error(`Unhandled event: "${json.event}"`);
					}
				});

				this.socket.addEventListener('open', () => resolve(this.socket));
				this.socket.addEventListener('error', event => {
					this.socket.close(1011, event);
					console.error(event);
					reject(event);
				});
			} else {
				resolve(this.socket);
			}
		});
		this.dispatchEvent(new Event('connect'));
	}

	get online() {
		return this.socket instanceof WebSocket && this.socket.readyState === WebSocket.OPEN;
	}

	get headerBackground() {
		return this.style.getPropertyValue('--chat-header-background');
	}

	set headerBackground(color) {
		this.style.setProperty('--chat-header-background', color);
	}

	get headercolor() {
		return this.style.getPropertyValue('--chat-header-color');
	}

	set headercolor(color) {
		this.style.setProperty('--chat-header-color', color);
	}

	get messages() {
		return this.messageContainer.messages;
	}

	get name() {
		return this.getAttribute('name');
	}

	set name(name) {
		this.setAttribute('name', name);
	}

	get ready() {
		return new Promise(resolve => {
			if (this.body instanceof Node) {
				resolve();
			} else {
				this.addEventListener('load', () => resolve(), {once: true});
			}
		});
	}

	get connected() {
		return new Promise(async (resolve, reject) => {
			await this.ready;
			if (this.socket === undefined) {
				this.addEventListener('connected', () => resolve());
				this.addEventListener('error', reject);
			} else {
				resolve();
			}
		});
	}

	get port() {
		return parseInt(this.getAttribute('port')) || parseInt(location.port);
	}

	set port(num) {
		this.setAttribute('port', num);
	}

	get src() {
		const url = new URL(this.getAttribute('src'), document.baseURI);
		if (this.hasAttribute('port')) {
			url.port = this.port;
		}
		if (! url.protocol.startsWith('ws')) {
			url.protocol = this.secure ? 'wss:' : 'ws:';
		}
		return url;
	}

	set src(src) {
		this.setAttribute('src', src);
	}

	get secure() {
		return this.hasAttribute('secure') || location.protocol === 'https:';
	}

	set secure(secure) {
		this.toggleAttribute('secure', secure);
	}

	get open() {
		return this.hasAttribute('open');
	}

	set open(open) {
		this.toggleAttribute('open', open);
	}

	get label() {
		return this.getAttribute('label');
	}

	set label(label) {
		this.setAttribute('label', label);
	}

	get disabled() {
		return this.hasAttribute('disabled');
	}

	set disabled(disabled) {
		this.toggleAttribute('disabled', disabled);
	}

	static get observedAttributes() {
		return [
			'open',
			'label',
			'header-background',
			'header-color',
			'name',
			'disabled',
		];
	}

	attributeChangedCallback(name, oldValue, newValue) {
		/*eslint no-case-declarations: 0*/
		this.ready.then(async () => {
			switch(name) {
			case 'label':
				const el = document.createElement('span');
				el.slot = 'label';
				el.textContent = newValue;
				[...this.querySelectorAll('[slot="label"]')].forEach(el => el.remove());
				this.append(el);
				break;
			case 'open':
				this.body.classList.toggle('open', newValue === '') && ! this.disabled;
				if (newValue !== null) {
					this.body.querySelector('[name="text"]').focus();
				}
				break;
			case 'disabled':
				if (newValue !== null) {
					this.open = false;
					this.classList.add('no-pointer-events', 'cursor-not-allowed');
				} else {
					this.classList.remove('no-pointer-events', 'cursor-not-allowed');
				}
				break;
			case 'header-background':
				this.headerBackground = newValue;
				break;
			case 'header-color':
				this.headercolor = newValue;
				break;
			case 'name':
				this.nameInput.value = newValue;
				await this.paired();
				this.socket.send(JSON.stringify({event: 'introduce', name: newValue}));
				break;
			default:
				throw new Error(`Unhandled attribute change: ${JSON.stringify({name, oldValue, newValue})}`);
			}
		});
	}

	async send({text = '', contentType = 'text/plain', event = 'message', time = new Date(), from = this.name}) {
		this.socket.send(JSON.stringify({message: text, contentType, event, time: time.toISOString(), from}));
	}

	async attach({attachment, time = new Date(), text = '', from = this.name}) {
		const msg = await new Promise((resolve, reject) => {
			if (! (attachment instanceof File)) {
				reject(new TypeError('Attachment must be a File'));
			} else {
				const reader = new FileReader();
				reader.addEventListener('load', event => resolve({
					event: 'attachment',
					size: attachment.size,
					contentType: attachment.type,
					name: attachment.name,
					data: event.target.result,
					time,
					text,
					from,
				}));
				reader.addEventListener('error', reject);
				reader.readAsDataURL(attachment);
			}
		});
		this.socket.send(JSON.stringify(msg));
		msg.action = 'sent';
		this.dispatchEvent(new CustomEvent('attachment', {detail: msg}));
	}

	clearMessages() {
		this.messages.forEach(m => m.remove());
	}
}

customElements.define('chat-app', HTMLChatAppElement);
