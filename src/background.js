// background.js - Service Worker for state management and persistence
// This is the brain of the extension - handles coordination between popup and content

console.log('🧠 LinkedIn Scraper Background Service Worker loaded');

// Current scraping state
let scrapingState = {
	isActive: false,
	currentStep: 'idle', // idle, loading_comments, scraping_comments, loading_reactions, scraping_reactions, complete
	progress: 0,
	data: {
		comments: [],
		reactions: [],
		merged: [],
	},
	error: null,
	startTime: null,
};

// Store for persistence
const STORAGE_KEY = 'linkedin_scraper_state';

// Listen for extension installation
chrome.runtime.onInstalled.addListener(() => {
	console.log('✅ LinkedIn Scraper Extension installed');
	resetScrapingState();
});

// Listen for messages from popup and content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	console.log('📨 Background received message:', message.type, message);

	switch (message.type) {
		case 'GET_STATE':
			sendResponse(scrapingState);
			break;

		case 'START_SCRAPING':
			handleStartScraping(message.options, message.tabId);
			sendResponse({ success: true });
			break;

		case 'STOP_SCRAPING':
			handleStopScraping();
			sendResponse({ success: true });
			break;

		case 'UPDATE_PROGRESS':
			handleProgressUpdate(message.data);
			sendResponse({ success: true });
			break;

		case 'STEP_COMPLETE':
			handleStepComplete(message.step, message.data);
			sendResponse({ success: true });
			break;

		case 'SCRAPING_ERROR':
			handleScrapingError(message.error);
			sendResponse({ success: true });
			break;

		case 'RESET_STATE':
			resetScrapingState();
			sendResponse({ success: true });
			break;

		case 'EXPORT_CSV':
			handleExportCSV(message.data, sendResponse);
			break;

		case 'EXPORT_JSON':
			handleExportJSON(message.data, sendResponse);
			break;

		default:
			console.log('❓ Unknown message type:', message.type);
			sendResponse({ error: 'Unknown message type' });
	}

	return true; // Keep message channel open
});

async function handleStartScraping(options, tabId) {
	console.log('🚀 Starting scraping process with options:', options, 'tabId:', tabId);

	if (!tabId) {
		console.error('❌ No tabId provided for scraping');
		handleScrapingError('No tab ID provided');
		return;
	}

	// First, check if content script is ready
	try {
		console.log('📤 Pinging content script to check if ready...');
		await chrome.tabs.sendMessage(tabId, { type: 'PING' });
		console.log('✅ Content script is ready');
	} catch (error) {
		console.error('❌ Content script not ready:', error);
		handleScrapingError('Content script not ready. Please refresh the page and try again.');
		return;
	}

	scrapingState = {
		isActive: true,
		currentStep: 'loading_comments',
		progress: 0,
		data: { comments: [], reactions: [], merged: [] },
		error: null,
		startTime: Date.now(),
		options: options,
		tabId: tabId,
	};

	await saveState();
	broadcastStateUpdate();

	// Send start command to content script
	try {
		console.log('📤 Sending START_COMMENT_LOADING to tab', tabId);
		await chrome.tabs.sendMessage(tabId, {
			type: 'START_COMMENT_LOADING',
			options: options,
		});
		console.log('✅ Message sent successfully to content script');
	} catch (error) {
		console.error('❌ Failed to send message to content script:', error);
		handleScrapingError(`Failed to communicate with page: ${error.message}`);
	}
}

async function handleStopScraping() {
	console.log('🛑 Stopping scraping process');

	if (scrapingState.tabId) {
		try {
			await chrome.tabs.sendMessage(scrapingState.tabId, {
				type: 'STOP_SCRAPING',
			});
		} catch {
			console.log('⚠️ Could not send stop message to content script');
		}
	}

	scrapingState.isActive = false;
	scrapingState.currentStep = 'idle';

	await saveState();
	broadcastStateUpdate();
}

async function handleProgressUpdate(data) {
	scrapingState.progress = data.progress;
	scrapingState.currentStep = data.step;

	if (data.count !== undefined) {
		if (data.type === 'comments') {
			scrapingState.data.comments = data.items || [];
		} else if (data.type === 'reactions') {
			scrapingState.data.reactions = data.items || [];
		}
	}

	await saveState();
	broadcastStateUpdate();
}

async function handleStepComplete(step, data) {
	console.log(`✅ Step completed: ${step}`, data);

	scrapingState.currentStep = step;

	if (step === 'comments_loaded') {
		scrapingState.progress = 25;
		// Start comment scraping
		chrome.tabs.sendMessage(scrapingState.tabId, {
			type: 'START_COMMENT_SCRAPING',
		});
	} else if (step === 'comments_scraped') {
		scrapingState.progress = 50;
		scrapingState.data.comments = data.comments || [];
		console.log(`📊 Stored ${scrapingState.data.comments.length} comments`);
		// Start reactions loading with options
		chrome.tabs.sendMessage(scrapingState.tabId, {
			type: 'START_REACTION_LOADING',
			options: scrapingState.options,
		});
	} else if (step === 'reactions_loaded') {
		scrapingState.progress = 75;
		// Reactions are now scraped during loading, so skip to scraping step
		chrome.tabs.sendMessage(scrapingState.tabId, {
			type: 'START_REACTION_SCRAPING',
		});
	} else if (step === 'reactions_scraped') {
		scrapingState.progress = 90;
		scrapingState.data.reactions = data.reactions || [];
		console.log(`📊 Stored ${scrapingState.data.reactions.length} reactions`);
		console.log(`📊 Sample reactions:`, scrapingState.data.reactions.slice(0, 3));
		// Merge data
		chrome.tabs.sendMessage(scrapingState.tabId, {
			type: 'MERGE_DATA',
			data: {
				comments: scrapingState.data.comments,
				reactions: scrapingState.data.reactions,
			},
		});
	} else if (step === 'complete') {
		scrapingState.progress = 100;
		scrapingState.currentStep = 'complete';
		scrapingState.isActive = false;
		scrapingState.data.merged = data.merged || [];

		// Use the statistics calculated by the content script (more reliable)
		const contentStats = data.stats || {};

		// Check if content script provided valid stats (use hasOwnProperty instead of truthy check)
		const hasValidStats = Object.prototype.hasOwnProperty.call(contentStats, 'totalPeople');

		const finalStats = hasValidStats
			? contentStats
			: {
					totalPeople: scrapingState.data.merged.length,
					commentsOnly: scrapingState.data.merged.filter((p) => p.isCommenting && !p.isReacting).length,
					reactionsOnly: scrapingState.data.merged.filter((p) => !p.isCommenting && p.isReacting).length,
					both: scrapingState.data.merged.filter((p) => p.isCommenting && p.isReacting).length,
				};

		console.log(`� Debug - Using ${hasValidStats ? 'content script' : 'recalculated'} stats`);
		console.log(`� Debug - finalStats:`, finalStats);
		console.log(`📊 Final merged data: ${scrapingState.data.merged.length} people`);
		console.log(`📊 Sample merged:`, scrapingState.data.merged.slice(0, 3));

		// Also log the counts from raw data for debugging
		console.log(
			`📊 Raw counts - Comments: ${scrapingState.data.comments.length}, Reactions: ${scrapingState.data.reactions.length}`,
		);

		// Store the statistics for the popup to display
		scrapingState.finalStats = finalStats;
	}

	await saveState();
	broadcastStateUpdate();
}

async function handleScrapingError(error) {
	console.error('❌ Scraping error:', error);

	scrapingState.error = error;
	scrapingState.isActive = false;
	scrapingState.currentStep = 'error';

	await saveState();
	broadcastStateUpdate();
}

async function resetScrapingState() {
	scrapingState = {
		isActive: false,
		currentStep: 'idle',
		progress: 0,
		data: { comments: [], reactions: [], merged: [] },
		error: null,
		startTime: null,
	};

	await saveState();
	broadcastStateUpdate();
}

async function saveState() {
	try {
		await chrome.storage.local.set({ [STORAGE_KEY]: scrapingState });
	} catch (error) {
		console.error('❌ Failed to save state:', error);
	}
}

async function loadState() {
	try {
		const result = await chrome.storage.local.get(STORAGE_KEY);
		if (result[STORAGE_KEY]) {
			scrapingState = { ...scrapingState, ...result[STORAGE_KEY] };
			console.log('📖 State loaded from storage');
		}
	} catch (error) {
		console.error('❌ Failed to load state:', error);
	}
}

function broadcastStateUpdate() {
	// Notify all popup instances of state change
	chrome.runtime
		.sendMessage({
			type: 'STATE_UPDATED',
			state: scrapingState,
		})
		.catch(() => {
			// Popup might not be open, that's fine
		});
}

// Load state on startup
loadState();

// Export functions implemented directly in background script
async function handleExportCSV(data, sendResponse) {
	try {
		let mergedData;
		if (data && data.mergedData) {
			mergedData = data.mergedData;
		} else {
			// Use current state data
			mergedData = scrapingState.data.merged;
		}

		if (!mergedData || mergedData.length === 0) {
			sendResponse({ success: false, error: 'No data available to export' });
			return;
		}

		const csv = exportToCSV(mergedData);
		sendResponse({ success: true, csv: csv });
	} catch (error) {
		console.error('Error exporting CSV:', error);
		sendResponse({ success: false, error: error.message });
	}
}

async function handleExportJSON(data, sendResponse) {
	try {
		let mergedData;
		if (data && data.mergedData) {
			mergedData = data.mergedData;
		} else {
			// Use current state data
			mergedData = scrapingState.data.merged;
		}

		if (!mergedData || mergedData.length === 0) {
			sendResponse({ success: false, error: 'No data available to export' });
			return;
		}

		const json = exportToJSON(mergedData);
		sendResponse({ success: true, json: json });
	} catch (error) {
		console.error('Error exporting JSON:', error);
		sendResponse({ success: false, error: error.message });
	}
}

// Export utility functions
function exportToCSV(data) {
	if (!data || !Array.isArray(data) || data.length === 0) {
		return '';
	}

	// Define headers for the new structure
	const headers = ['FirstName', 'LastName', 'FullName', 'Url', 'Comment', 'IsReacting', 'IsCommenting'];

	// Convert data to CSV rows
	const rows = data.map((person) => [
		`"${(person.firstName || '').replace(/"/g, '""')}"`,
		`"${(person.lastName || '').replace(/"/g, '""')}"`,
		`"${(person.fullName || person.name || '').replace(/"/g, '""')}"`, // Fallback to old 'name' field for backward compatibility
		`"${(person.url || '').replace(/"/g, '""')}"`,
		`"${(person.comment || '').replace(/"/g, '""')}"`,
		`"${person.isReacting ? 'true' : 'false'}"`,
		`"${person.isCommenting ? 'true' : 'false'}"`,
	]);

	// Combine headers and rows
	const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');

	return csvContent;
}

function exportToJSON(data) {
	if (!data || !Array.isArray(data)) {
		return '[]';
	}

	const exportData = {
		exportDate: new Date().toISOString(),
		totalRecords: data.length,
		data: data,
	};

	return JSON.stringify(exportData, null, 2);
}
