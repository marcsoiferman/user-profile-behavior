import '@polymer/polymer/polymer-legacy.js';
import 'd2l-organization-hm-behavior/d2l-organization-hm-behavior.js';
import { Classes, Rels } from 'd2l-hypermedia-constants';
import SirenParse from 'siren-parser';

/* @polymerBehavior window.D2L.UserProfileBehavior */
window.D2L.UserProfileBehaviorImpl = {
	properties: {
		token: String,
		userUrl: String,
		options: {
			type: Object,
			value: function() { return {}; }
		},
		_doneRequests: {
			type: Boolean,
			value: false
		},
		_backgroundColor: {
			type: String,
			observer: '_checkDoneRequests',
			value: ''
		},
		_backgroundUrl: {
			type: String,
			observer: '_checkDoneRequests',
			value: ''
		},
		_name: {
			type: String,
			observer: '_checkDoneRequests',
			value: ''
		}
	},
	_rootUrl: '',
	_enrollmentsUrl: '',
	_folioUrl: '',
	_iconUrl: '',
	_previousUserCall: null,
	_checkDoneRequests: function() {
		var backgroundExists = !!(this._backgroundUrl || this._backgroundColor);
		var backgroundNeeded = (this.options || {}).background;
		var doneRequests = (!backgroundNeeded || backgroundExists) && !!this._name;

		if (doneRequests) {
			if (this._backgroundUrl) {
				// preload the image a bit so after the fade-in it's hopefully loaded
				var self = this;
				var setLoaded = function() {
					self._doneRequests = true;
				};
				var imagePreloader = document.createElement('img');
				imagePreloader.addEventListener('load', setLoaded);
				imagePreloader.addEventListener('error', setLoaded);
				imagePreloader.setAttribute('src', self._backgroundUrl);
			}

			this._doneRequests = true;
		}
	},
	generateUserRequest: function(userUrl, token, options) {
		this._previousUserCall = this._previousUserCall || {};
		this._doneRequests = false;

		if (
			userUrl &&
			token &&
			userUrl !== this._previousUserCall.userUrl &&
			token !== this._previousUserCall.token
		) {
			this._rootUrl = '';
			this._enrollmentsUrl = '';
			this._folioUrl = '';
			this._iconUrl = '';
			this._backgroundColor = '';
			this._backgroundUrl = '';
			this._name = '';
			this.userUrl = userUrl || this.userUrl;
			this.token = token || this.token;
			this.options = options || this.options;
			this._previousUserCall = { userUrl: this.userUrl, token: this.token };

			return this._fetchUser()
				.then(this._fetchFolio.bind(this))
				.catch(function() {
					// Folio image fetch failed, falling back to organization image
					return this._fetchEnrollments()
						.then(this._fetchOrganization.bind(this))
						.then(this._fetchOrganizationImage.bind(this))
						.catch(function() {
							// Organization image fetch failed, falling back to theme colour
							return this._fetchRoot()
								.then(this._fetchInstitution.bind(this))
								.then(this._fetchTheme.bind(this))
								.catch(function() {
									// If all else fails!
									this._backgroundColor = 'initial';
								}.bind(this));
						}.bind(this));
				}.bind(this));
		}

		return Promise.resolve();
	},
	_fetchSirenEntity: function(url) {
		var request = new Request(url, {
			headers: new Headers({
				accept: 'application/vnd.siren+json',
				authorization: 'Bearer ' + this.token
			})
		});

		return window.d2lfetch
			.fetch(request)
			.then(function(response) {
				if (response.ok) {
					return response.json();
				}
				return Promise.reject(new Error(response.status));
			})
			.then(SirenParse);
	},
	_fetchUser: function() {
		return this._fetchSirenEntity(this.userUrl).then(function(userEntity) {
			this._rootUrl = (userEntity.getLinkByRel(Rels.root) || {}).href;
			this._enrollmentsUrl = (userEntity.getLinkByRel(Rels.myEnrollments) || {}).href;
			this._folioUrl = (userEntity.getLinkByRel(Rels.Folio.folio) || {}).href;

			var displayNameEntity = userEntity.getSubEntityByRel(Rels.displayName);
			if (displayNameEntity) {
				this._name = displayNameEntity.properties && displayNameEntity.properties.name;
			}

			var profileEntity = userEntity.getSubEntityByRel(Rels.userProfile);
			if (profileEntity) {
				var image = profileEntity.getSubEntityByRel(Rels.profileImage);

				if (image.class && image.class.indexOf('default-image') !== -1) {
					this._iconUrl = null;
				} else {
					this._iconUrl = (image.getLinkByRel(Rels.thumbnailRegular) || {}).href;
				}
			}
		}.bind(this));
	},
	_fetchFolio: function() {
		if (!this.options.background) {
			return Promise.resolve();
		}

		if (!this._folioUrl) {
			return Promise.reject(new Error('Folio URL not set'));
		}

		return this._fetchSirenEntity(this._folioUrl).then(function(folioEntity) {
			var tiles = (folioEntity.getSubEntitiesByRel(Rels.Folio.evidence));
			for (var i = 0; i < tiles.length; i++) {
				var content = tiles[i].getSubEntityByRel(Rels.Folio.contentItem);
				var type = content.properties.type;
				switch (type) {
					case 'Png':
					case 'Jpg':
					case 'Gif':
						this._backgroundUrl = content.properties.url;
						return;
				}
			}
			return Promise.reject(new Error('Did not find adequate Folio evidence'));
		}.bind(this));
	},
	_fetchEnrollments: function() {
		if (!this._enrollmentsUrl) {
			return Promise.reject(new Error('Enrollments URL not set'));
		}

		this._enrollmentsUrl += '?pageSize=2&orgUnitTypeId=3&embedDepth=1';
		return this._fetchSirenEntity(this._enrollmentsUrl).then(function(enrollmentsEntity) {
			var enrollmentEntities = enrollmentsEntity.getSubEntitiesByRel(Rels.userEnrollment);

			if (enrollmentEntities.length === 1) {
				var organizationUrl = enrollmentEntities[0].getLinkByRel(Rels.organization).href;
				return Promise.resolve(organizationUrl);
			} else {
				return Promise.reject(new Error('User does not have exactly one enrollment: ' + enrollmentEntities.length));
			}
		}.bind(this));
	},
	_fetchOrganization: function(organizationUrl) {
		return this._fetchSirenEntity(organizationUrl).then(function(organizationEntity) {
			var imageLink = organizationEntity.getSubEntityByClass(Classes.courseImage.courseImage);

			if (!imageLink) {
				return Promise.reject(new Error('Organization image link not found'));
			}

			var organizationImageUrl = imageLink.href;
			return Promise.resolve(organizationImageUrl);
		}.bind(this));
	},
	_fetchOrganizationImage: function(organizationImageUrl) {
		return this._fetchSirenEntity(organizationImageUrl).then(function(organizationImageEntity) {
			var backgroundImages = this._getBestImageLinks(organizationImageEntity, Classes.courseImage.wide);
			this._backgroundUrl = backgroundImages.highMin || backgroundImages.lowMax;
		}.bind(this));
	},
	_fetchRoot: function() {
		if (!this._rootUrl) {
			return Promise.reject(new Error('Root URL not set'));
		}

		return this._fetchSirenEntity(this._rootUrl).then(function(rootEntity) {
			var institutionUrl = (rootEntity.getLinkByRel(Rels.organization) || {}).href;
			return Promise.resolve(institutionUrl);
		}.bind(this));
	},
	_fetchInstitution: function(institutionUrl) {
		return this._fetchSirenEntity(institutionUrl).then(function(institutionEntity) {
			var themeUrl = (institutionEntity.getLinkByRel(Rels.Themes.theme) || {}).href;
			return Promise.resolve(themeUrl);
		}.bind(this));
	},
	_fetchTheme: function(themeUrl) {
		return this._fetchSirenEntity(themeUrl).then(function(themeEntity) {
			if (themeEntity.properties) {
				this._backgroundColor = themeEntity.properties.BackgroundColor;
			} else {
				return Promise.reject(new Error('Theme colour not available'));
			}
		}.bind(this));
	}
};

window.D2L = window.D2L || {};
/*
* Behavior for user profile-related elements such as user-tile and user-switcher.
* @polymerBehavior window.D2L.UserProfileBehavior
*/
window.D2L.UserProfileBehavior = [
	D2L.PolymerBehaviors.Hypermedia.OrganizationHMBehavior,
	window.D2L.UserProfileBehaviorImpl
];
