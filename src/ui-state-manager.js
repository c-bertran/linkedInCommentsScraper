// ui-state-manager.js - Centralized UI state management for the extension
// This module handles state transformations and UI coordination

class UIStateManager {
	constructor() {
		this.subscribers = new Set();
		this.currentState = null;
	}

	// Subscribe to state changes
	subscribe(callback) {
		this.subscribers.add(callback);

		// Return unsubscribe function
		return () => {
			this.subscribers.delete(callback);
		};
	}

	// Update state and notify subscribers
	updateState(newState) {
		const previousState = this.currentState;
		this.currentState = newState;

		// Notify all subscribers of the state change
		this.subscribers.forEach((callback) => {
			try {
				callback(newState, previousState);
			} catch (error) {
				console.error('Error in state subscriber:', error);
			}
		});
	}

	// Transform background script state to UI-friendly format
	transformBackgroundState(bgState) {
		if (!bgState) {
			return {
				phase: 'UNKNOWN',
				message: 'No state available',
				progress: 0,
				showProgress: false,
				showResults: false,
				showError: false,
				canStart: false,
				canStop: false,
			};
		}

		// Handle error state
		if (bgState.error) {
			return {
				phase: 'ERROR',
				message: `❌ ${bgState.error}`,
				progress: 0,
				showProgress: false,
				showResults: false,
				showError: true,
				canStart: true,
				canStop: false,
				errorMessage: bgState.error,
			};
		}

		// Handle active scraping
		if (bgState.isActive) {
			const stepMessages = {
				loading_comments: 'Loading comments...',
				scraping_comments: 'Scraping comments...',
				loading_reactions: 'Loading reactions...',
				scraping_reactions: 'Scraping reactions...',
				complete: 'Finalizing...',
			};

			return {
				phase: 'SCRAPING',
				message: '⚙️ Scraping in progress...',
				progress: bgState.progress || 0,
				progressMessage: stepMessages[bgState.currentStep] || 'Processing...',
				stepDetails: this.getStepDetails(bgState),
				showProgress: true,
				showResults: false,
				showError: false,
				canStart: false,
				canStop: true,
			};
		}

		// Handle completed state
		if (bgState.currentStep === 'complete' && bgState.data.merged && bgState.data.merged.length > 0) {
			// Use finalStats from background state if available, otherwise calculate
			const stats = bgState.finalStats || this.calculateStats(bgState.data.merged);

			console.log('🔄 UI State Manager - using stats:', stats);
			console.log('🔄 UI State Manager - bgState.finalStats available:', !!bgState.finalStats);

			return {
				phase: 'COMPLETED',
				message: '✅ Scraping completed!',
				progress: 100,
				showProgress: false,
				showResults: true,
				showError: false,
				canStart: true,
				canStop: false,
				results: {
					mergedData: bgState.data.merged,
					comments: bgState.data.comments || [],
					reactions: bgState.data.reactions || [],
					stats: stats,
				},
			};
		}

		// Default idle state
		return {
			phase: 'IDLE',
			message: '✅ Ready to scrape LinkedIn post!',
			progress: 0,
			showProgress: false,
			showResults: false,
			showError: false,
			canStart: true,
			canStop: false,
		};
	}

	// Get detailed step information
	getStepDetails(bgState) {
		const details = {};

		if (bgState.data) {
			details.commentsCount = bgState.data.comments ? bgState.data.comments.length : 0;
			details.reactionsCount = bgState.data.reactions ? bgState.data.reactions.length : 0;
			details.mergedCount = bgState.data.merged ? bgState.data.merged.length : 0;
		}

		return details;
	}

	// Calculate statistics from merged data
	calculateStats(mergedData) {
		const stats = {
			totalPeople: mergedData.length,
			commentsOnly: 0,
			reactionsOnly: 0,
			both: 0,
		};

		mergedData.forEach((person) => {
			// Use the boolean flags that were set during merging
			const isCommenting = person.isCommenting === true;
			const isReacting = person.isReacting === true;

			if (isCommenting && isReacting) {
				stats.both++;
			} else if (isCommenting) {
				stats.commentsOnly++;
			} else if (isReacting) {
				stats.reactionsOnly++;
			}
		});

		return stats;
	}

	// Validate if the current page is suitable for scraping
	validatePage(url) {
		if (!url) return false;
		if (!url.includes('linkedin.com')) return false;

		// Could add more specific validation here
		return true;
	}

	// Format progress message with details
	formatProgressMessage(step, details) {
		switch (step) {
			case 'loading_comments':
				return `Loading comments... (${details.commentsCount || 0} found)`;
			case 'scraping_comments':
				return `Scraping comments... (${details.commentsCount || 0} processed)`;
			case 'loading_reactions':
				return `Loading reactions... (${details.reactionsCount || 0} found)`;
			case 'scraping_reactions':
				return `Scraping reactions... (${details.reactionsCount || 0} processed)`;
			case 'complete':
				return 'Merging data and finalizing...';
			default:
				return 'Processing...';
		}
	}
}

// Create singleton instance
const uiStateManager = new UIStateManager();

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
	module.exports = UIStateManager;
} else {
	window.UIStateManager = UIStateManager;
	window.uiStateManager = uiStateManager;
}
