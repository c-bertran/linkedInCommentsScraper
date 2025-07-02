// content.js - LinkedIn DOM Scraper Content Script
// Focused purely on DOM interaction - no state management

console.log('🔍 LinkedIn Scraper Content Script loaded');

// Current scraping state (local only)
let isScrapingActive = false;
let currentOptions = {};

// Message handler - responds to background script commands
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	console.log('📨 Content script received:', message.type);

	switch (message.type) {
		case 'PING':
			// Respond to ping to confirm content script is ready
			sendResponse({ ready: true });
			return true;

		case 'START_COMMENT_LOADING':
			handleCommentLoading(message.options);
			break;

		case 'START_COMMENT_SCRAPING':
			handleCommentScraping();
			break;

		case 'START_REACTION_LOADING':
			handleReactionLoading(message.options || currentOptions);
			break;

		case 'START_REACTION_SCRAPING':
			handleReactionScraping();
			break;

		case 'MERGE_DATA':
			handleDataMerging(message.data);
			break;

		case 'STOP_SCRAPING':
			handleStopScraping();
			break;

		default:
			console.log('❓ Unknown message type:', message.type);
	}

	sendResponse({ success: true });
	return true;
});

// Step 1: Load all comments by clicking "load more" buttons
async function handleCommentLoading(options) {
	console.log('🔄 Starting comment loading with options:', options);
	currentStep = 'loading_comments';
	isScrapingActive = true;

	// Store options globally for other functions
	currentOptions = options || {};

	debugLog('Comment loading started with options:', currentOptions);

	try {
		// Check if comments should be included
		if (options && options.includeComments === false) {
			console.log('⏭️ Skipping comment loading (includeComments = false)');
			reportStepComplete('comments_loaded', { count: 0 });
			return;
		}

		debugLog('Comments enabled, proceeding with loading');

		// Report progress
		reportProgress('loading_comments', 5);

		let totalLoaded = 0;

		while (isScrapingActive) {
			// Scroll to bottom to reveal load more button
			window.scrollTo(0, document.body.scrollHeight);
			await DOMHelpers.sleep(1500);

			// Look for the specific load more button
			const loadMoreButton = document.querySelector(SELECTORS.COMMENTS.LOAD_MORE_BUTTON);

			if (loadMoreButton && DOMHelpers.isVisible(loadMoreButton)) {
				console.log(`✓ Found load more button`);

				// Count comments before clicking
				const container = document.querySelector(SELECTORS.COMMENTS.CONTAINER);
				const beforeCount = container ? container.querySelectorAll('article').length : 0;

				// Scroll button into view and click
				DOMHelpers.scrollToElement(loadMoreButton);
				await DOMHelpers.sleep(1000);

				await DOMHelpers.safeClick(loadMoreButton);
				console.log('✓ Load more button clicked');

				// Wait for new comments to load
				let waitAttempts = 0;
				let afterCount = beforeCount;

				while (waitAttempts < 10 && afterCount <= beforeCount && isScrapingActive) {
					await DOMHelpers.sleep(1000);
					waitAttempts++;
					const currentContainer = document.querySelector(SELECTORS.COMMENTS.CONTAINER);
					afterCount = currentContainer ? currentContainer.querySelectorAll('article').length : 0;
				}

				if (afterCount > beforeCount) {
					const newlyLoaded = afterCount - beforeCount;
					totalLoaded += newlyLoaded;
					console.log(`✅ Loaded ${newlyLoaded} new comments (total: ${afterCount})`);

					// Report progress with count
					reportProgress('loading_comments', Math.min(20, 5 + totalLoaded / 10), {
						type: 'comments',
						count: afterCount,
					});
				} else {
					console.log(`⚠️ No new comments loaded, stopping`);
					break;
				}
			} else {
				console.log(`✅ No more load more buttons found - all comments loaded`);
				break;
			}
		}

		// Final count
		const finalContainer = document.querySelector(SELECTORS.COMMENTS.CONTAINER);
		const finalCount = finalContainer ? finalContainer.querySelectorAll('article').length : 0;
		console.log(`✅ Comment loading complete: ${finalCount} articles`);

		// Report completion
		reportStepComplete('comments_loaded', { count: finalCount });
	} catch (error) {
		console.error('❌ Error loading comments:', error);
		reportError(error.message);
	}
}

// Step 2: Scrape all loaded comments
async function handleCommentScraping() {
	console.log('📝 Starting comment scraping...');
	currentStep = 'scraping_comments';

	try {
		// Check if comments should be included
		if (currentOptions && currentOptions.includeComments === false) {
			console.log('⏭️ Skipping comment scraping (includeComments = false)');
			reportStepComplete('comments_scraped', { comments: [] });
			return;
		}

		reportProgress('scraping_comments', 30);

		const commenters = [];

		// Get main comments (excluding replies)
		let mainComments = DOMHelpers.findWithFallback([
			SELECTORS.COMMENTS.MAIN_COMMENT_ITEMS,
			SELECTORS.COMMENTS.ALL_ARTICLES,
		]);

		// Filter out replies if we got all articles
		if (mainComments.length === 0 || mainComments[0].closest) {
			console.log('Filtering out replies manually');
			const allArticles = Array.from(document.querySelectorAll(SELECTORS.COMMENTS.ALL_ARTICLES));
			mainComments = allArticles.filter((article) => {
				return !SELECTORS.COMMENTS.REPLY_CONTAINERS.some((selector) => article.closest(selector));
			});
		}

		console.log(`Processing ${mainComments.length} main comments`);

		mainComments.forEach((comment, index) => {
			try {
				// Extract name
				const nameElement = DOMHelpers.findOneWithFallback(SELECTORS.COMMENT_PARSING.NAME_SELECTORS, comment);

				if (!nameElement) return;

				const rawName = nameElement.textContent.trim();
				if (!rawName) return;

				// Parse name into firstName and lastName
				const parsedName = parsePersonName(rawName);
				if (!parsedName.firstName && !parsedName.lastName) return;

				// Extract profile URL
				const profileLink = DOMHelpers.extractProfileLink(nameElement);
				if (!profileLink) return;

				// Normalize URL for consistent matching
				const normalizedUrl = normalizeLinkedInUrl(profileLink);
				if (!normalizedUrl) return;

				// Extract comment text using your DOM structure: <article> -> second <div> -> deeply <div class="update-components-text">
				let commentText = '';
				try {
					// Method 1: Your specific DOM structure
					const articleDivs = comment.querySelectorAll(':scope > div');
					if (articleDivs.length >= 2) {
						const secondDiv = articleDivs[1];
						const updateComponentsText = secondDiv.querySelector('.update-components-text');
						if (updateComponentsText) {
							commentText = updateComponentsText.textContent.trim();
							console.log(`📝 Found comment via update-components-text: "${commentText}"`);
						}
					}

					// Method 2: Fallback to original selectors if first method fails
					if (!commentText) {
						const commentElement = DOMHelpers.findOneWithFallback(SELECTORS.COMMENT_PARSING.CONTENT_SELECTORS, comment);
						commentText = commentElement ? commentElement.textContent.trim() : '';
						console.log(`📝 Found comment via fallback selectors: "${commentText}"`);
					}

					// Method 3: Last resort - look for any text content
					if (!commentText) {
						const textElements = comment.querySelectorAll(
							'span[dir="ltr"], .feed-shared-text, .comments-comment-item-content-body',
						);
						for (const textEl of textElements) {
							const text = textEl.textContent.trim();
							if (text && text.length > 10) {
								// Avoid short texts like "Like" or "Reply"
								commentText = text;
								console.log(`📝 Found comment via text search: "${commentText}"`);
								break;
							}
						}
					}
				} catch (error) {
					console.error(`Error extracting comment text for ${parsedName.fullName}:`, error);
				}

				console.log(
					`📝 Final comment text for ${parsedName.fullName}: "${commentText}" (length: ${commentText.length})`,
				);

				const commenter = {
					firstName: parsedName.firstName,
					lastName: parsedName.lastName,
					fullName: parsedName.fullName,
					url: normalizedUrl, // Use normalized URL
					comment: commentText,
					isReacting: false, // Will be updated when we merge with reactions
					isCommenting: true, // Since this person commented
				};

				commenters.push(commenter);
				console.log(`✓ Parsed commenter: ${parsedName.fullName} (${normalizedUrl}) - Comment: "${commentText}"`);
			} catch (error) {
				console.error(`Error parsing comment ${index}:`, error);
			}
		});

		console.log(`📊 Comment scraping complete: ${commenters.length} commenters`);
		console.log('📝 Sample commenters:', commenters.slice(0, 3));

		// Report completion
		reportStepComplete('comments_scraped', { comments: commenters });
	} catch (error) {
		console.error('❌ Error scraping comments:', error);
		reportError(error.message);
	}
}

// Step 3: Load all reactions by opening modal and scrolling
async function handleReactionLoading(options) {
	console.log('👍 Starting reaction loading with options:', options);
	currentStep = 'loading_reactions';

	try {
		// Check if reactions should be included
		if (options && options.includeReactions === false) {
			console.log('⏭️ Skipping reaction loading (includeReactions = false)');
			reportStepComplete('reactions_scraped', { reactions: [] });
			return;
		}

		debugLog('Reactions enabled, proceeding with loading');

		reportProgress('loading_reactions', 55);

		// Scroll to top to find reactions button
		window.scrollTo(0, 0);
		await DOMHelpers.sleep(2000);

		// Find post content
		const postContent = document.querySelector(SELECTORS.REACTIONS.POST_CONTAINER);
		if (postContent) {
			DOMHelpers.scrollToElement(postContent, { behavior: 'smooth', block: 'start' });
			await DOMHelpers.sleep(2000);
		}

		// Find reactions button
		let reactionButton = null;
		for (const selector of SELECTORS.REACTIONS.BUTTON_SELECTORS) {
			const buttons = document.querySelectorAll(selector);
			for (const button of buttons) {
				if (DOMHelpers.isVisible(button)) {
					const ariaLabel = button.getAttribute('aria-label') || '';
					if (
						ariaLabel.includes('people') ||
						ariaLabel.includes('others') ||
						ariaLabel.includes('personnes') ||
						ariaLabel.includes('autres') ||
						ariaLabel.includes('réactions')
					) {
						reactionButton = button;
						console.log(`✓ Found reactions button: "${ariaLabel}"`);
						break;
					}
				}
			}
			if (reactionButton) break;
		}

		if (!reactionButton) {
			console.log('No reactions button found - post might not have reactions');
			reportStepComplete('reactions_loaded', { count: 0 });
			return;
		}

		// Click reactions button
		DOMHelpers.scrollToElement(reactionButton, { behavior: 'smooth', block: 'center' });
		await DOMHelpers.sleep(2000);

		await DOMHelpers.safeClick(reactionButton);
		console.log('✓ Reactions button clicked');

		// Wait for modal to load
		console.log('⏳ Waiting for reactions modal...');
		await DOMHelpers.sleep(5000);

		// Find modal
		const modal = DOMHelpers.findOneWithFallback(SELECTORS.REACTIONS.MODAL_SELECTORS);
		if (!modal) {
			throw new Error('Could not find reactions modal');
		}

		console.log('✓ Modal found, loading all reactions...');

		const reactors = [];
		let previousCount = 0;

		// Keep scrolling until no loader appears or no new reactions are loaded
		let scrollAttempts = 0;
		while (isScrapingActive && scrollAttempts < 100) {
			scrollAttempts++;

			// Find modal content for scrolling
			const modalContent =
				DOMHelpers.findOneWithFallback([
					'.artdeco-modal__content.social-details-reactors-modal__content',
					'.social-details-reactors-tab-body',
				]) || modal;

			// Count current reactors before scrolling
			const currentReactorElements = DOMHelpers.findWithFallback(SELECTORS.REACTOR_PARSING.ITEM_SELECTORS, modal);
			const currentCount = currentReactorElements.length;

			console.log(`📊 Scroll attempt ${scrollAttempts}: ${currentCount} reactors visible`);

			// Scroll to bottom of modal
			modalContent.scrollTop = modalContent.scrollHeight;
			await DOMHelpers.sleep(2000);

			// Check for loader within modal
			const loader = modalContent.querySelector(SELECTORS.REACTIONS.LOADER);
			if (loader && DOMHelpers.isVisible(loader)) {
				console.log(`📡 Loader detected - more reactions loading...`);

				// Wait for loader to disappear
				let loaderWaitAttempts = 0;
				while (DOMHelpers.isVisible(loader) && loaderWaitAttempts < 10 && isScrapingActive) {
					await DOMHelpers.sleep(1000);
					loaderWaitAttempts++;
				}

				// Report progress
				const progress = 55 + Math.min(15, scrollAttempts / 5); // 55-70%
				reportProgress('loading_reactions', progress, {
					type: 'reactions',
					count: currentCount,
				});
			} else {
				// No loader found - check if we got new reactions anyway
				if (currentCount > previousCount) {
					console.log(`📊 No loader but found ${currentCount - previousCount} new reactions`);
					previousCount = currentCount;
					// Continue scrolling in case more reactions appear
					if (scrollAttempts < 3) continue; // Give it a few more attempts
				}

				console.log(`✅ No loader found and no new reactions - stopping`);
				break;
			}

			previousCount = currentCount;
		}

		// Final count and immediate scraping
		const finalReactorElements = DOMHelpers.findWithFallback(SELECTORS.REACTOR_PARSING.ITEM_SELECTORS, modal);
		console.log(`✅ Reaction loading complete: ${finalReactorElements.length} reactors found`);

		// Now scrape all the loaded reactors immediately
		console.log(`📝 Starting immediate reaction scraping...`);

		if (finalReactorElements.length === 0) {
			console.warn(`⚠️ No reactor elements found! Trying alternative approach...`);
			// Try to find any list items or person containers in the modal
			const alternativeElements = modal.querySelectorAll(
				'li, [data-finite-scroll-hotkey-item], .artdeco-entity-lockup',
			);
			console.log(`📝 Found ${alternativeElements.length} alternative elements`);
			finalReactorElements.push(...alternativeElements);
		}

		finalReactorElements.forEach((reactor, index) => {
			try {
				console.log(`📝 Processing reactor ${index + 1}/${finalReactorElements.length}`);

				// Extract name
				const nameElement = DOMHelpers.findOneWithFallback(SELECTORS.REACTOR_PARSING.NAME_SELECTORS, reactor);

				if (!nameElement) {
					console.log(`⚠️ No name element found for reactor ${index}`);
					return;
				}

				const rawName = nameElement.textContent.trim();
				if (!rawName) {
					console.log(`⚠️ Empty name for reactor ${index}`);
					return;
				}

				// Parse name into firstName and lastName
				const parsedName = parsePersonName(rawName);
				if (!parsedName.firstName && !parsedName.lastName) {
					console.log(`⚠️ Invalid name for reactor ${index}: ${rawName}`);
					return;
				}

				// Extract profile link
				const profileLink = DOMHelpers.extractProfileLink(nameElement);
				if (!profileLink) {
					console.log(`⚠️ No profile link found for reactor ${parsedName.fullName}`);
					return;
				}

				// Normalize URL for consistent matching
				const normalizedUrl = normalizeLinkedInUrl(profileLink);
				if (!normalizedUrl) {
					console.log(`⚠️ Failed to normalize URL for reactor ${parsedName.fullName}: ${profileLink}`);
					return;
				}

				const reactorData = {
					firstName: parsedName.firstName,
					lastName: parsedName.lastName,
					fullName: parsedName.fullName,
					url: normalizedUrl,
					comment: '',
					isReacting: true,
					isCommenting: false,
				};

				reactors.push(reactorData);
				console.log(`✓ Parsed reactor: ${parsedName.fullName} (${normalizedUrl})`);
			} catch (error) {
				console.log(`Error parsing reactor ${index}:`, error.message);
			}
		});

		console.log(`📊 Reaction scraping complete: ${reactors.length} reactors parsed`);
		console.log('👍 Sample reactors:', reactors.slice(0, 3));

		// Report completion with the scraped data
		reportStepComplete('reactions_scraped', { reactions: reactors });

		// Close the reactions modal after scraping
		await closeReactionsModal();
	} catch (error) {
		console.error('❌ Error loading reactions:', error);

		// Try to close the modal even if there was an error
		await closeReactionsModal();

		reportError(error.message);
	}
}

// Step 4: Scrape all loaded reactions (DEPRECATED - now done in loading phase)
async function handleReactionScraping() {
	console.log('📝 Reaction scraping already completed during loading phase');
	// This function is no longer needed since we do scraping during loading
	reportStepComplete('reactions_scraped', { reactions: [] });
}

// Step 5: Merge data and complete
async function handleDataMerging(data) {
	console.log('🔗 Starting data merging...');
	currentStep = 'merging';

	try {
		reportProgress('merging', 90);

		const comments = data.comments || [];
		const reactions = data.reactions || [];

		console.log(`📊 Merging: ${comments.length} commenters, ${reactions.length} reactors`);

		// Create a map to merge by NAME (more reliable than URL)
		const mergedData = new Map();

		// First pass: add all commenters (use fullName as key)
		comments.forEach((commenter) => {
			if (commenter.fullName || commenter.name) {
				// Handle both old and new data structures
				const fullName = commenter.fullName || commenter.name;
				const firstName = commenter.firstName || '';
				const lastName = commenter.lastName || '';

				const nameKey = fullName.trim().toLowerCase(); // Normalize name for matching
				mergedData.set(nameKey, {
					firstName: firstName,
					lastName: lastName,
					fullName: fullName, // Keep original case
					url: commenter.url, // Use commenter URL (usually more readable)
					comment: commenter.comment,
					isReacting: false,
					isCommenting: true,
				});
				console.log(`📝 Added commenter: ${fullName} -> ${commenter.url}`);
			}
		});

		console.log(`📊 After adding commenters: ${mergedData.size} unique entries`);

		// Second pass: add reactors and merge with existing commenters (by fullName)
		let mergedCount = 0;
		reactions.forEach((reactor) => {
			if (reactor.fullName || reactor.name) {
				// Handle both old and new data structures
				const fullName = reactor.fullName || reactor.name;
				const firstName = reactor.firstName || '';
				const lastName = reactor.lastName || '';

				const nameKey = fullName.trim().toLowerCase(); // Normalize name for matching

				if (mergedData.has(nameKey)) {
					// Person both commented and reacted - update existing entry
					const existing = mergedData.get(nameKey);
					existing.isReacting = true;
					// Keep the commenter URL (more readable than the reactor ACoAAA... format)
					mergedCount++;
					console.log(`🔗 MERGED: ${fullName} both commented and reacted`);
					console.log(`   📝 Comment URL: ${existing.url}`);
					console.log(`   👍 Reactor URL: ${reactor.url}`);
				} else {
					// Person only reacted - create new entry
					mergedData.set(nameKey, {
						firstName: firstName,
						lastName: lastName,
						fullName: fullName,
						url: reactor.url,
						comment: '',
						isReacting: true,
						isCommenting: false,
					});
					console.log(`👍 Added reactor: ${fullName} -> ${reactor.url}`);
				}
			}
		});

		console.log(`📊 Merging summary: ${mergedCount} people both commented and reacted`);

		// Convert to array
		const mergedPeople = Array.from(mergedData.values());

		const stats = {
			totalPeople: mergedPeople.length,
			commentsOnly: mergedPeople.filter((p) => p.isCommenting && !p.isReacting).length,
			reactionsOnly: mergedPeople.filter((p) => !p.isCommenting && p.isReacting).length,
			both: mergedPeople.filter((p) => p.isCommenting && p.isReacting).length,
		};

		console.log(`✅ Data merging complete:`, stats);
		console.log(`📊 Detailed breakdown:`);
		console.log(`   - Comments Only (isCommenting=true, isReacting=false): ${stats.commentsOnly}`);
		console.log(`   - Reactions Only (isCommenting=false, isReacting=true): ${stats.reactionsOnly}`);
		console.log(`   - Both (isCommenting=true, isReacting=true): ${stats.both}`);
		console.log(`📊 Sample merged data:`, mergedPeople.slice(0, 3));

		// Verify the data structure by checking a few entries
		mergedPeople.slice(0, 5).forEach((person, idx) => {
			console.log(
				`📊 Person ${idx + 1}: ${person.fullName} (${person.firstName} ${person.lastName}) - commenting: ${person.isCommenting}, reacting: ${person.isReacting}`,
			);
		});

		// Report final completion with the correct data structure
		reportStepComplete('complete', {
			merged: mergedPeople,
			stats: stats,
		});
	} catch (error) {
		console.error('❌ Error merging data:', error);
		reportError(error.message);
	}
}

// Handle stop command
function handleStopScraping() {
	console.log('🛑 Scraping stopped by user');
	isScrapingActive = false;
	currentStep = 'idle';
}

// Helper functions for communication with background script
function reportProgress(step, progress, data = {}) {
	chrome.runtime
		.sendMessage({
			type: 'UPDATE_PROGRESS',
			data: {
				step,
				progress,
				...data,
			},
		})
		.catch(() => {
			// Background script might not be available
		});
}

// Helper function to normalize LinkedIn URLs for consistent matching
function normalizeLinkedInUrl(url) {
	if (!url) return null;

	try {
		// Remove any trailing slashes, query parameters, and fragments
		let normalized = url.split('?')[0].split('#')[0];
		if (normalized.endsWith('/')) {
			normalized = normalized.slice(0, -1);
		}

		// Ensure it starts with https://
		if (normalized.startsWith('//')) {
			normalized = 'https:' + normalized;
		} else if (!normalized.startsWith('http')) {
			normalized = 'https://www.linkedin.com' + normalized;
		}

		// Convert to consistent format: https://www.linkedin.com/in/username
		const match = normalized.match(/linkedin\.com\/in\/([^\/\?#]+)/);
		if (match) {
			return `https://www.linkedin.com/in/${match[1]}`;
		}

		return normalized;
	} catch (error) {
		console.warn('Failed to normalize URL:', url, error);
		return url;
	}
}

function reportStepComplete(step, data = {}) {
	chrome.runtime
		.sendMessage({
			type: 'STEP_COMPLETE',
			step,
			data,
		})
		.catch(() => {
			// Background script might not be available
		});
}

function reportError(error) {
	chrome.runtime
		.sendMessage({
			type: 'SCRAPING_ERROR',
			error,
		})
		.catch(() => {
			// Background script might not be available
		});
}

// Function to close the reactions modal after scraping
async function closeReactionsModal() {
	console.log('🔒 Attempting to close reactions modal...');

	try {
		// Look for the modal dismiss button
		const dismissButton = document.querySelector('button.artdeco-modal__dismiss');

		if (dismissButton && DOMHelpers.isVisible(dismissButton)) {
			console.log('✓ Found modal dismiss button, clicking...');
			await DOMHelpers.safeClick(dismissButton);
			await DOMHelpers.sleep(1000); // Wait for modal to close
			console.log('✅ Modal closed successfully');
		} else {
			console.log('⚠️ Modal dismiss button not found or not visible');

			// Try alternative selectors for closing the modal
			const alternativeSelectors = [
				'.artdeco-modal__dismiss',
				'button[aria-label*="Dismiss"]',
				'button[aria-label*="Close"]',
				'button[aria-label*="Fermer"]', // French
				'.artdeco-modal .artdeco-button--circle',
				'.artdeco-modal button[type="button"]',
			];

			for (const selector of alternativeSelectors) {
				const closeBtn = document.querySelector(selector);
				if (closeBtn && DOMHelpers.isVisible(closeBtn)) {
					console.log(`✓ Found alternative close button: ${selector}`);
					await DOMHelpers.safeClick(closeBtn);
					await DOMHelpers.sleep(1000);
					console.log('✅ Modal closed with alternative button');
					return;
				}
			}

			// If no button found, try pressing Escape key
			console.log('🔄 Trying to close modal with Escape key...');
			document.dispatchEvent(
				new KeyboardEvent('keydown', {
					key: 'Escape',
					keyCode: 27,
					which: 27,
					bubbles: true,
				}),
			);
			await DOMHelpers.sleep(1000);
			console.log('✅ Sent Escape key to close modal');
		}
	} catch (error) {
		console.error('❌ Error closing reactions modal:', error);
	}
}

// Check if page is valid for scraping
function checkPageValidity() {
	const isValid = DOMHelpers.isLinkedInPostPage();
	console.log(`Page validity check: ${isValid ? 'Valid' : 'Invalid'} LinkedIn post page`);
	return isValid;
}

// Initialize content script
console.log('✅ LinkedIn Scraper Content Script ready');

// Helper function to parse and split names
function parsePersonName(fullName) {
	if (!fullName || typeof fullName !== 'string') {
		return { firstName: '', lastName: '', fullName: '' };
	}

	// Remove all emojis using Unicode property escape
	const cleanName = fullName.replace(/\p{Emoji}/gu, '').trim();

	if (!cleanName) {
		return { firstName: '', lastName: '', fullName: fullName.trim() };
	}

	// Split by spaces and filter out empty parts
	const nameParts = cleanName.split(/\s+/).filter((part) => part.length > 0);

	if (nameParts.length === 0) {
		return { firstName: '', lastName: '', fullName: fullName.trim() };
	}

	if (nameParts.length === 1) {
		// Only one part - use as first name
		const firstName = capitalizeFirstLetter(nameParts[0]);
		return {
			firstName: firstName,
			lastName: '',
			fullName: firstName,
		};
	}

	if (nameParts.length === 2) {
		// Two parts - [firstName, lastName]
		const firstName = capitalizeFirstLetter(nameParts[0]);
		const lastName = capitalizeFirstLetter(nameParts[1]);
		return {
			firstName: firstName,
			lastName: lastName,
			fullName: `${firstName} ${lastName}`,
		};
	}

	// More than 2 parts - all first parts become firstName, last part becomes lastName
	const firstNameParts = nameParts.slice(0, -1);
	const lastNamePart = nameParts[nameParts.length - 1];

	const firstName = firstNameParts.map((part) => capitalizeFirstLetter(part)).join(' ');
	const lastName = capitalizeFirstLetter(lastNamePart);

	return {
		firstName: firstName,
		lastName: lastName,
		fullName: `${firstName} ${lastName}`,
	};
}

// Helper function to capitalize first letter and lowercase the rest
function capitalizeFirstLetter(str) {
	if (!str || typeof str !== 'string') return '';
	return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// Helper function for debug logging
function debugLog(message, ...args) {
	if (currentOptions && currentOptions.debugMode) {
		console.log(`🐛 DEBUG: ${message}`, ...args);
	}
}
