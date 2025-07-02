// popup.js - Chrome Extension Popup UI Layer
// This file handles the popup interface as a pure UI layer,
// using the UI state manager for centralized state handling

console.log('LinkedIn Scraper popup loaded');

// DOM elements
const pageStatus = document.getElementById('page-status');
const scrapeBtn = document.getElementById('scrape-btn');
const stopBtn = document.getElementById('stop-btn');
const progressSection = document.getElementById('progress-section');
const resultsSection = document.getElementById('results-section');
const errorSection = document.getElementById('error-section');

// State tracking
let currentTabId = null;
let stateSubscription = null;

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', initializePopup);

async function initializePopup() {
	console.log('Initializing popup...');

	// Get current tab
	await getCurrentTab();

	// Set up UI state manager subscription
	setupStateSubscription();

	// Set up event listeners
	setupEventListeners();

	// Initial state refresh
	await refreshState();

	// Set up state polling for real-time updates
	setupStatePolling();
}

function setupStateSubscription() {
	// Subscribe to UI state changes
	stateSubscription = uiStateManager.subscribe((uiState, previousState) => {
		updateUI(uiState);
	});
}

async function refreshState() {
	try {
		// Get current state from background script
		const bgState = await chrome.runtime.sendMessage({
			type: 'GET_STATE',
			tabId: currentTabId,
		});

		if (bgState) {
			// Transform background state to UI state and update
			const uiState = uiStateManager.transformBackgroundState(bgState);
			uiStateManager.updateState(uiState);
		} else {
			console.error('Failed to get state from background');
			await checkCurrentPage();
		}
	} catch (error) {
		console.error('Error refreshing state:', error);
		await checkCurrentPage();
	}
}

async function checkCurrentPage() {
	try {
		const tab = await getCurrentTab();

		if (!tab || !tab.url || !tab.url.includes('linkedin.com')) {
			const uiState = {
				phase: 'ERROR',
				message: '❌ Not on LinkedIn. Please navigate to a LinkedIn post.',
				canStart: false,
				canStop: false,
				showError: false,
				showProgress: false,
				showResults: false,
			};
			uiStateManager.updateState(uiState);
			return;
		}

		// For now, assume LinkedIn page is valid - the content script will validate when scraping starts
		const uiState = {
			phase: 'IDLE',
			message: '✅ Ready to scrape LinkedIn post!',
			canStart: true,
			canStop: false,
			showError: false,
			showProgress: false,
			showResults: false,
		};
		uiStateManager.updateState(uiState);
	} catch (error) {
		console.error('Error checking current page:', error);
		const uiState = {
			phase: 'ERROR',
			message: '❌ Error checking page status.',
			canStart: false,
			canStop: false,
			showError: false,
			showProgress: false,
			showResults: false,
		};
		uiStateManager.updateState(uiState);
	}
}

async function getCurrentTab() {
	try {
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
		currentTabId = tab.id;
		return tab;
	} catch (error) {
		console.error('Error getting current tab:', error);
		return null;
	}
}

function updateUI(uiState) {
	if (!uiState) return;

	console.log('Updating UI with state:', uiState);

	// Update status message
	pageStatus.textContent = uiState.message;
	pageStatus.className = `status-message ${uiState.phase.toLowerCase()}`;

	// Update buttons
	scrapeBtn.disabled = !uiState.canStart;
	stopBtn.style.display = uiState.canStop ? 'block' : 'none';

	// Show/hide sections
	progressSection.style.display = uiState.showProgress ? 'block' : 'none';
	resultsSection.style.display = uiState.showResults ? 'block' : 'none';
	errorSection.style.display = uiState.showError ? 'block' : 'none';

	// Update specific sections
	if (uiState.showProgress) {
		updateProgressDisplay(uiState);
	}

	if (uiState.showResults) {
		updateResultsDisplay(uiState);
	}

	if (uiState.showError) {
		updateErrorDisplay(uiState);
	}
}

function updateProgressDisplay(uiState) {
	const progressFill = document.getElementById('progress-fill');
	const progressText = document.getElementById('progress-text');

	if (progressFill) {
		progressFill.style.width = `${uiState.progress || 0}%`;
	}

	if (progressText) {
		let message = uiState.progressMessage || 'Processing...';
		if (uiState.stepDetails) {
			message = uiStateManager.formatProgressMessage(uiState.currentStep, uiState.stepDetails);
		}
		progressText.textContent = message;
	}
}

function updateResultsDisplay(uiState) {
	if (!uiState.results) {
		console.log('🔍 Popup: No results in uiState');
		return;
	}

	console.log('🔍 Popup: Updating results display with:', uiState.results);

	const statsContainer = document.getElementById('results-stats');
	const stats = uiState.results.stats;

	console.log('🔍 Popup: Stats from uiState.results.stats:', stats);

	if (statsContainer && stats) {
		statsContainer.innerHTML = `
            <div class="stat-item">
                <span class="stat-label">Total People:</span>
                <span class="stat-value">${stats.totalPeople}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Comments Only:</span>
                <span class="stat-value">${stats.commentsOnly}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Reactions Only:</span>
                <span class="stat-value">${stats.reactionsOnly}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Both Comment & Reaction:</span>
                <span class="stat-value">${stats.both}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Comments Found:</span>
                <span class="stat-value">${uiState.results.comments.length}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Reactions Found:</span>
                <span class="stat-value">${uiState.results.reactions.length}</span>
            </div>
        `;
		console.log('🔍 Popup: Updated stats container HTML');
	} else {
		console.log('🔍 Popup: Missing statsContainer or stats', { statsContainer: !!statsContainer, stats: !!stats });
	}

	// Store current results for download/copy
	window.currentResults = uiState.results;
}

function updateErrorDisplay(uiState) {
	const errorMessage = document.getElementById('error-message');
	if (errorMessage && uiState.errorMessage) {
		errorMessage.textContent = uiState.errorMessage;
	}
}

function setupStatePolling() {
	// Poll for state updates every 500ms when popup is open
	const pollInterval = setInterval(async () => {
		try {
			const bgState = await chrome.runtime.sendMessage({
				type: 'GET_STATE',
				tabId: currentTabId,
			});

			if (bgState) {
				console.log('🔍 Popup: Received background state:', bgState);
				console.log('🔍 Popup: bgState.finalStats:', bgState.finalStats);
				console.log('🔍 Popup: bgState.currentStep:', bgState.currentStep);

				// Transform and update UI state
				const uiState = uiStateManager.transformBackgroundState(bgState);
				console.log('🔍 Popup: Transformed UI state:', uiState);
				uiStateManager.updateState(uiState);
			}
		} catch (error) {
			// Popup might be closing, stop polling
			clearInterval(pollInterval);
		}
	}, 500);

	// Clean up when popup closes
	window.addEventListener('beforeunload', () => {
		clearInterval(pollInterval);
		if (stateSubscription) {
			stateSubscription();
		}
	});
}

function setupEventListeners() {
	// Scrape button click
	scrapeBtn.addEventListener('click', startScraping);

	// Stop button click
	stopBtn.addEventListener('click', stopScraping);

	// Download CSV button
	document.getElementById('download-csv-btn').addEventListener('click', downloadCSV);

	// Copy JSON button
	document.getElementById('copy-json-btn').addEventListener('click', copyJSON);

	// Retry button
	document.getElementById('retry-btn').addEventListener('click', retryOperation);
}

async function startScraping() {
	console.log('Starting scraping process...');

	try {
		// Get scraping options
		const options = {
			includeComments: document.getElementById('include-comments').checked,
			includeReactions: document.getElementById('include-reactions').checked,
			debugMode: document.getElementById('debug-mode').checked,
		};

		// Send start command to background script
		const response = await chrome.runtime.sendMessage({
			type: 'START_SCRAPING',
			options: options,
			tabId: currentTabId,
		});

		if (response && response.success) {
			console.log('Scraping started successfully');
			// UI will be updated via state polling
		} else {
			const errorState = {
				phase: 'ERROR',
				message: '❌ Failed to start scraping',
				errorMessage: 'Failed to start scraping process',
				showError: true,
				canStart: true,
				canStop: false,
			};
			uiStateManager.updateState(errorState);
		}
	} catch (error) {
		console.error('Error starting scraping:', error);
		const errorState = {
			phase: 'ERROR',
			message: '❌ Failed to start scraping',
			errorMessage: error.message || 'Failed to start scraping process',
			showError: true,
			canStart: true,
			canStop: false,
		};
		uiStateManager.updateState(errorState);
	}
}

async function stopScraping() {
	try {
		const response = await chrome.runtime.sendMessage({
			type: 'STOP_SCRAPING',
			tabId: currentTabId,
		});

		if (response && response.success) {
			console.log('Scraping stopped successfully');
		} else {
			console.error('Failed to stop scraping');
		}
	} catch (error) {
		console.error('Error stopping scraping:', error);
	}
}

async function retryOperation() {
	// Reset any error state and check page again
	await refreshState();
}

async function downloadCSV() {
	try {
		if (!window.currentResults || !window.currentResults.mergedData) {
			const errorState = {
				phase: 'ERROR',
				message: '❌ No data available for download',
				errorMessage: 'No data available for download',
				showError: true,
			};
			uiStateManager.updateState(errorState);
			return;
		}

		// Get CSV data from background script using data-manager
		const response = await chrome.runtime.sendMessage({
			type: 'EXPORT_CSV',
			data: window.currentResults,
		});

		if (response && response.success) {
			// Create and trigger download
			const blob = new Blob([response.csv], { type: 'text/csv' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `linkedin-scrape-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);

			console.log('CSV download triggered');
		} else {
			const errorState = {
				phase: 'ERROR',
				message: '❌ Failed to export CSV data',
				errorMessage: response?.error || 'Failed to export CSV data',
				showError: true,
			};
			uiStateManager.updateState(errorState);
		}
	} catch (error) {
		console.error('Error downloading CSV:', error);
		const errorState = {
			phase: 'ERROR',
			message: '❌ Error downloading CSV file',
			errorMessage: error.message || 'Error downloading CSV file',
			showError: true,
		};
		uiStateManager.updateState(errorState);
	}
}

async function copyJSON() {
	try {
		if (!window.currentResults || !window.currentResults.mergedData) {
			const errorState = {
				phase: 'ERROR',
				message: '❌ No data available to copy',
				errorMessage: 'No data available to copy',
				showError: true,
			};
			uiStateManager.updateState(errorState);
			return;
		}

		// Get JSON data from background script using data-manager
		const response = await chrome.runtime.sendMessage({
			type: 'EXPORT_JSON',
			data: window.currentResults,
		});

		if (response && response.success) {
			// Copy to clipboard
			await navigator.clipboard.writeText(response.json);

			// Temporarily change button text
			const copyBtn = document.getElementById('copy-json-btn');
			const originalText = copyBtn.textContent;
			copyBtn.textContent = '✅ Copied!';
			setTimeout(() => {
				copyBtn.textContent = originalText;
			}, 2000);
		} else {
			const errorState = {
				phase: 'ERROR',
				message: '❌ Failed to export JSON data',
				errorMessage: response?.error || 'Failed to export JSON data',
				showError: true,
			};
			uiStateManager.updateState(errorState);
		}
	} catch (error) {
		console.error('Failed to copy to clipboard:', error);
		const errorState = {
			phase: 'ERROR',
			message: '❌ Failed to copy data to clipboard',
			errorMessage: error.message || 'Failed to copy data to clipboard',
			showError: true,
		};
		uiStateManager.updateState(errorState);
	}
}
