// dom-helpers.js - Reusable DOM utilities and selectors
// Centralized place for all LinkedIn DOM selectors and helper functions

console.log('🔧 DOM Helpers loaded');

// LinkedIn DOM Selectors - single source of truth
const SELECTORS = {
	// Comments
	COMMENTS: {
		CONTAINER: '.comments-comments-list__container',
		LIST: '.comments-comments-list',
		LOAD_MORE_BUTTON: 'button.comments-comments-list__load-more-comments-button--cr',
		MAIN_COMMENT_ITEMS: '.comments-comments-list > .comments-comment-item',
		ALL_ARTICLES: '.comments-comments-list article',
		REPLY_CONTAINERS: ['.comments-comment-item__comments-list', '.comments-replies-list', '[data-test-id="replies"]'],
	},

	// Comment parsing
	COMMENT_PARSING: {
		NAME_SELECTORS: [
			'a[href*="/in/"] .comment-thread-text-commenter-name',
			'a[href*="/in/"] span[aria-hidden="true"]',
			'a[href*="/in/"] span',
			'.comment-thread-text-commenter-name',
			'.comments-post-meta__name-text',
		],
		CONTENT_SELECTORS: [
			'.comments-comment-item__main-content .comments-comment-item-content-body span[dir="ltr"]',
			'.comments-comment-item-content-body span[dir="ltr"]',
			'.comment-thread-text-body span',
			'.comments-comment-item-content-body',
			'.feed-shared-text span',
		],
		PROFILE_LINK: 'a[href*="/in/"]',
	},

	// Reactions
	REACTIONS: {
		POST_CONTAINER: '.feed-shared-update-v2, .feed-shared-update',
		BUTTON_SELECTORS: [
			'button[aria-expanded="false"][aria-label*="people"]',
			'button[aria-expanded="false"][aria-label*="others"]',
			'button[aria-expanded="false"][aria-label*="personnes"]',
			'button[aria-expanded="false"][aria-label*="autres"]',
			'.social-details-reactors-facepile__reactions-modal-button',
			'[data-reaction-details]',
			'button[data-reaction-details]',
			'.social-details-social-counts__count-value',
			'.social-details-social-counts button',
			'.reactions-list-button',
		],
		MODAL_SELECTORS: [
			'.artdeco-modal__content.social-details-reactors-modal__content',
			'.social-details-reactors-tab-body',
			'.artdeco-modal__content',
			'.reactions-modal-content',
			'.social-details-modal',
		],
		LOADER: '.artdeco-loader',
		CLOSE_BUTTON:
			'.artdeco-modal__dismiss, .artdeco-button[aria-label*="Dismiss"], .artdeco-button[aria-label*="Close"]',
	},

	// Reactor parsing
	REACTOR_PARSING: {
		ITEM_SELECTORS: [
			'.social-details-reactors-facepile__list-item',
			'.social-details-reactors-tab-body li',
			'.artdeco-modal li',
			'.reactions-list li',
			'.social-details-modal li',
		],
		NAME_SELECTORS: [
			'a[href*="/in/"] span[aria-hidden="true"]',
			'a[href*="/in/"] .t-14',
			'a[href*="/in/"] span',
			'.social-details-reactors-tab-body__member-name',
			'.artdeco-entity-lockup__title',
		],
		PROFILE_LINK: 'a[href*="/in/"]',
	},
};

// Utility functions
const DOMHelpers = {
	// Wait for element to appear
	waitForElement(selector, timeout = 10000, parent = document) {
		return new Promise((resolve, reject) => {
			const element = parent.querySelector(selector);
			if (element) {
				resolve(element);
				return;
			}

			const observer = new MutationObserver((mutations) => {
				const element = parent.querySelector(selector);
				if (element) {
					observer.disconnect();
					resolve(element);
				}
			});

			observer.observe(parent, {
				childList: true,
				subtree: true,
			});

			setTimeout(() => {
				observer.disconnect();
				reject(new Error(`Element ${selector} not found within ${timeout}ms`));
			}, timeout);
		});
	},

	// Check if element is visible
	isVisible(element) {
		return element && element.offsetParent !== null && !element.disabled;
	},

	// Safe click with fallbacks
	async safeClick(element) {
		if (!element) throw new Error('Element not found for click');

		try {
			element.click();
			return true;
		} catch (e) {
			try {
				element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
				return true;
			} catch (e2) {
				throw new Error('All click methods failed');
			}
		}
	},

	// Scroll element into view
	scrollToElement(element, options = { behavior: 'auto', block: 'center' }) {
		if (element) {
			element.scrollIntoView(options);
		}
	},

	// Sleep utility
	sleep(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	},

	// Find elements with fallback selectors
	findWithFallback(selectors, parent = document) {
		for (const selector of selectors) {
			const elements = parent.querySelectorAll(selector);
			if (elements.length > 0) {
				return Array.from(elements);
			}
		}
		return [];
	},

	// Find single element with fallback selectors
	findOneWithFallback(selectors, parent = document) {
		for (const selector of selectors) {
			const element = parent.querySelector(selector);
			if (element) {
				return element;
			}
		}
		return null;
	},

	// Extract profile link and ensure it's complete
	extractProfileLink(element) {
		const linkElement =
			element.closest(SELECTORS.COMMENT_PARSING.PROFILE_LINK) ||
			element.querySelector(SELECTORS.COMMENT_PARSING.PROFILE_LINK);

		if (!linkElement) return null;

		let profileLink = linkElement.href;
		if (profileLink && !profileLink.startsWith('http')) {
			profileLink = 'https://www.linkedin.com' + profileLink;
		}

		return profileLink;
	},

	// Extract emails from text
	extractEmails(texts) {
		const emailRegex = /[\w\.-]+@[\w\.-]+\.\w+/g;
		return texts.map((text) => {
			if (!text) return null;
			const emailMatch = text.match(emailRegex);
			return emailMatch ? emailMatch[0] : null;
		});
	},

	// Check if current page is a LinkedIn post
	isLinkedInPostPage() {
		const url = window.location.href;

		// LinkedIn post URLs typically contain 'activity' or 'posts'
		if (url.includes('/posts/') || url.includes('/activity/')) {
			return true;
		}

		// Also check for feed posts
		if (url.includes('/feed/') && document.querySelector('.feed-shared-update-v2')) {
			return true;
		}

		// Check for specific post elements
		const postElements = document.querySelectorAll(
			'.feed-shared-update-v2, .share-update-card, [data-urn*="activity"]',
		);

		return postElements.length > 0;
	},
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
	module.exports = { SELECTORS, DOMHelpers };
} else {
	window.SELECTORS = SELECTORS;
	window.DOMHelpers = DOMHelpers;
}
