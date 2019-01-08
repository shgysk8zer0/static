import {importLink} from '/static/js/std-js/functions.js';

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
		date = new Date(),
	} = {}) {
		const el = document.createElement('div');
		const p = document.createElement('p');
		const time = document.createElement('time');
		p.textContent = text;
		time.textContent = date.toLocaleString();
		time.dateTime = date.toISOString();
		time.hidden = true;
		el.addEventListener('click', () => time.toggleAttribute('hidden'), {passive: true});
		el.slot = 'messages';
		el.append(p, time);
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
}

if (window.customElements && window.customElements.define instanceof Function) {
  customElements.define('chat-log', HTMLChatLogElement);
}
