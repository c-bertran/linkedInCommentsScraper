// data-manager.js - Handles data processing, merging, and export
// Pure data functions - no DOM manipulation

console.log('📊 Data Manager loaded');

const DataManager = {
	// Merge commenters and reactors, removing duplicates
	mergeAndDeduplicate(commenters, reactors) {
		console.log(`📊 Merging data: ${commenters.length} commenters, ${reactors.length} reactors`);

		const uniquePeople = [];
		const seenProfiles = new Map();

		// First pass: add commenters
		for (const commenter of commenters) {
			if (commenter.profileLink) {
				seenProfiles.set(commenter.profileLink, {
					...commenter,
					hasComment: true,
					hasReaction: false,
				});
			}
		}

		// Second pass: add reactors and merge with existing commenters
		for (const reactor of reactors) {
			if (reactor.profileLink) {
				if (seenProfiles.has(reactor.profileLink)) {
					// Person both commented and reacted
					const existing = seenProfiles.get(reactor.profileLink);
					existing.hasReaction = true;
				} else {
					// Person only reacted
					seenProfiles.set(reactor.profileLink, {
						...reactor,
						hasComment: false,
						hasReaction: true,
					});
				}
			}
		}

		// Convert to array
		uniquePeople.push(...seenProfiles.values());

		const stats = {
			totalPeople: uniquePeople.length,
			commentsOnly: uniquePeople.filter((p) => p.hasComment && !p.hasReaction).length,
			reactionsOnly: uniquePeople.filter((p) => !p.hasComment && p.hasReaction).length,
			both: uniquePeople.filter((p) => p.hasComment && p.hasReaction).length,
		};

		console.log(`📊 Merge results:`, stats);

		return {
			people: uniquePeople,
			stats: stats,
		};
	},

	// Generate CSV content
	generateCSV(people) {
		if (!people || people.length === 0) return '';

		const headers = ['Name', 'Profile Link', 'Email', 'Comment', 'Has Comment', 'Has Reaction'];
		const csvRows = [headers.join(',')];

		people.forEach((person) => {
			const row = [
				`"${(person.name || '').replace(/"/g, '""')}"`,
				`"${person.profileLink || ''}"`,
				`"${person.email || ''}"`,
				`"${(person.comment || '').replace(/"/g, '""')}"`,
				person.hasComment ? 'TRUE' : 'FALSE',
				person.hasReaction ? 'TRUE' : 'FALSE',
			];
			csvRows.push(row.join(','));
		});

		return csvRows.join('\n');
	},

	// Generate JSON content
	generateJSON(people, includeStats = true) {
		if (!people) return '[]';

		const data = {
			timestamp: new Date().toISOString(),
			count: people.length,
			people: people,
		};

		if (includeStats) {
			data.stats = {
				commentsOnly: people.filter((p) => p.hasComment && !p.hasReaction).length,
				reactionsOnly: people.filter((p) => !p.hasComment && p.hasReaction).length,
				both: people.filter((p) => p.hasComment && p.hasReaction).length,
			};
		}

		return JSON.stringify(data, null, 2);
	},

	// Validate person data
	validatePerson(person) {
		if (!person) return false;
		if (!person.name || !person.profileLink) return false;
		if (!person.profileLink.includes('linkedin.com')) return false;
		return true;
	},

	// Clean and normalize person data
	cleanPersonData(person) {
		if (!person) return null;

		const cleaned = {
			name: (person.name || '').trim(),
			profileLink: person.profileLink || '',
			email: person.email || null,
			comment: person.comment ? person.comment.trim() : null,
			hasComment: Boolean(person.hasComment),
			hasReaction: Boolean(person.hasReaction),
		};

		// Ensure full profile URL
		if (cleaned.profileLink && !cleaned.profileLink.startsWith('http')) {
			cleaned.profileLink = 'https://www.linkedin.com' + cleaned.profileLink;
		}

		return this.validatePerson(cleaned) ? cleaned : null;
	},

	// Process and clean array of people
	processPersonList(people) {
		if (!Array.isArray(people)) return [];

		return people.map((person) => this.cleanPersonData(person)).filter((person) => person !== null);
	},

	// Create download blob
	createDownloadBlob(content, type = 'text/csv') {
		return new Blob([content], { type });
	},

	// Generate filename with timestamp
	generateFilename(prefix = 'linkedin-scrape', extension = 'csv') {
		const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
		return `${prefix}-${timestamp}.${extension}`;
	},

	// Save data to Chrome storage
	async saveToStorage(data, key = 'scrape_results') {
		try {
			const storageData = {
				[key]: {
					data: data,
					timestamp: Date.now(),
					url: window.location.href,
				},
			};

			await chrome.storage.local.set(storageData);
			console.log('📁 Data saved to storage');
			return true;
		} catch (error) {
			console.error('❌ Failed to save to storage:', error);
			return false;
		}
	},

	// Load data from Chrome storage
	async loadFromStorage(key = 'scrape_results') {
		try {
			const result = await chrome.storage.local.get(key);
			if (result[key]) {
				console.log('📖 Data loaded from storage');
				return result[key];
			}
			return null;
		} catch (error) {
			console.error('❌ Failed to load from storage:', error);
			return null;
		}
	},

	// Clear storage
	async clearStorage(key = 'scrape_results') {
		try {
			await chrome.storage.local.remove(key);
			console.log('🗑️ Storage cleared');
			return true;
		} catch (error) {
			console.error('❌ Failed to clear storage:', error);
			return false;
		}
	},
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
	module.exports = DataManager;
} else {
	window.DataManager = DataManager;
}
