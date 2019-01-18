import {importLink} from '../../js/std-js/functions.js';

export default class HTMLLoginFormElement extends HTMLElement {
	constructor() {
		super();
		importLink('login-form-template').then(async form => {
			this.attachShadow({mode: 'open'});
			[...form.head.children].forEach(child => this.shadowRoot.append(child.cloneNode(true)));
			[...form.body.children].forEach(child => this.shadowRoot.append(child.cloneNode(true)));
			this.form.addEventListener('submit', async event => {
				event.preventDefault();
				try {
					const data = Object.fromEntries(new FormData(event.target).entries());
					console.log(data);
					this.form.reset();
				} catch (error) {
					console.error(error);
				}
			});
			this.form.addEventListener('reset', () => this.dispatchEvent(new Event('reset')), {passive: true});
		});
	}

	get method() {
		return this.hasAttribute('method') ? this.getAttribute('method').toUpperCase() : 'POST' ;
	}

	set method(method) {
		this.setAttribute('method', method);
	}

	get action() {
		return new URL(this.getAttribute('method'), document.baseURI);
	}

	get form() {
		return this.shadowRoot.querySelector('form');
	}
}

customElements.define('login-form', HTMLLoginFormElement);
