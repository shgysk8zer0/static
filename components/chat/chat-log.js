import {importLink} from '../../js/std-js/functions.js';

export default class HTMLChatLogElement extends HTMLElement {
	constructor() {
		super();
		this.attachShadow({mode: 'open'});
		importLink('chat-log-template').then(link => {
			[...link.head.children].forEach(child => this.shadowRoot.append(child.cloneNode(true)));
			[...link.body.children].forEach(child => this.shadowRoot.append(child.cloneNode(true)));
		});
	}

	get messages() {
		return [...this.shadowRoot.querySelector('slot[name="messages"]').assignedNodes()];
	}

	async addMessage({
		text = '',
		action = 'received',
		from = null,
		// contentType = 'text/plain',
		date = new Date(),
	} = {}) {
		await customElements.whenDefined('chat-message');
		const HTMLChatMessageElement = customElements.get('chat-message');
		const el = new HTMLChatMessageElement({text, timestamp: date, from});
		await customElements.whenDefined('gravatar-img');
		const HTMLGravatarImageElement = customElements.get('gravatar-img');
		const grav = new HTMLGravatarImageElement({
			hash: '43578597e449298f5488c2407c8a8ae5',
			referrerPolicy: 'origin-when-cross-origin',
			sizes: '2vmin',
			decoding: 'async',
			sizeList: [128, 80, 64, 32, 24, 12],
			defaultSize: 24,
		});
		grav.classList.add('round', 'shadow');
		el.avatar = grav;
		el.classList.add('block');
		el.slot = 'messages';
		el.classList.add('message', action);
		el.animate([{
			opacity: 0,
		}, {
			opacity: 1,
		}], {
			duration: 350,
			easing: 'ease-in-out',
			fill: 'both',
		});
		this.append(el);
		el.scrollIntoView({block: 'end', behavior: 'smooth',});
		return el;
	}

	async addAttachment({size, contentType, time, data, name, text = '', action = 'received', from = null} = {}) {
		if (! contentType.startsWith('image/')) {
			throw new TypeError(`Expected Content-Type to match image but got "${contentType}"`);
		}
		await customElements.whenDefined('chat-message');
		const HTMLChatMessageElement = customElements.get('chat-message');
		const el = new HTMLChatMessageElement({text, timestamp: time, from});
		await customElements.whenDefined('gravatar-img');
		const HTMLGravatarImageElement = customElements.get('gravatar-img');
		const grav = new HTMLGravatarImageElement({
			hash: '43578597e449298f5488c2407c8a8ae5',
			referrerPolicy: 'origin-when-cross-origin',
			sizes: '2vmin',
			decoding: 'async',
			sizeList: [128, 80, 64, 32, 24, 12],
			defaultSize: 24,
		});
		grav.classList.add('round', 'shadow');
		el.avatar = grav;
		el.classList.add('block');
		el.slot = 'messages';
		const a = document.createElement('a');
		const img = document.createElement('img');
		a.classList.add('inline-block', 'btn');
		a.slot = 'download-btn';
		a.download = name;
		a.dataset.size = size;
		time = new Date(time);
		img.decoding = 'async';
		img.src = data;
		a.href = img.src;
		a.role = 'button';
		a.textContent = `Download "${name}"`;
		a.slot = 'download-btn';
		img.alt = name;
		el.classList.add('message', action);
		if (text !== '') {
			el.text = text;
		}
		el.animate([{
			opacity: 0,
		}, {
			opacity: 1,
		}], {
			duration: 350,
			easing: 'ease-in-out',
			fill: 'both',
		});
		img.addEventListener('load', () => {
			img.addEventListener('dblclick', () => open(img.src));
			img.classList.add('cursor-pointer', 'card');
			img.slot = 'attachment';
			URL.revokeObjectURL(img.src);
			el.append(img, a);
			el.scrollIntoView({block: 'start', behavior: 'smooth'});
		}, {once: true});
		img.addEventListener('error', console.error);
		this.append(el);
	}
}

customElements.define('chat-log', HTMLChatLogElement);
