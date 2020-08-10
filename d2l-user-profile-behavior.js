import { D2LOrganizationHMBehaviorMixin } from './d2l-organization-hm-behavior-lit.js';
import { Classes, Rels } from 'd2l-hypermedia-constants';
import SirenParse from 'siren-parser';

export const D2LUserProfileMixin = superclass => class extends D2LOrganizationHMBehaviorMixin(superclass) {

	static get properties() {
		return {
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
				value: ''
			},
			_backgroundUrl: {
				type: String,
				value: ''
			},
			_name: {
				type: String,
				value: ''
			}
		};
	}

	updated(changedProperties) {
		if (changedProperties.has('_backgroundColor') || changedProperties.has('_backgroundUrl') || changedProperties.has('_name')) {
			this._checkDoneRequests();
		}
	}

	constructor() {
		super();
		this._rootUrl = '';
		this._enrollmentsUrl = '';
		this._folioUrl = '';
		this._iconUrl = '';
		this._previousUserCall = null;
	}

	_checkDoneRequests() {
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
	}

	async generateUserRequest(userUrl, token, options) {
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
			this._backgroundColor = 'initial';
			this._backgroundUrl = '';
			this._name = '';
			this.userUrl = userUrl || this.userUrl;
			this.token = token || this.token;
			this.options = options || this.options;
			this._previousUserCall = { userUrl: this.userUrl, token: this.token };

			let done = await this._getBackgroundFromUsersLatestFolioEvidence();
			if (!done) {
				done = await this._getBackgroundFromUsersFirstCourse();
			}
			if (!done) {
				done = await this._getInstitutionThemeBackground();
			}
		}

		return undefined;
	}

	async _getBackgroundFromUsersLatestFolioEvidence() {
		let success = undefined;
		try {
			success = await this._fetchUser();
			if (success) {
				success = await this._fetchFolio();
			}
		}
		catch (error) {
			success = undefined;
		}
		return success;
	}

	async _getBackgroundFromUsersFirstCourse() {
		let success = undefined;
		try {
			success = await this._fetchEnrollments();
			if (success) {
				success = await this._fetchOrganization()
			}
			if (success) {
				await this._fetchOrganizationImage();
			}
		}
		catch (error) {
			success = undefined;
		}
		return success;
	}

	async _getInstitutionThemeBackground() {
		let success = undefined;
		try {
			success = await this._fetchRoot();
			if (success) {
				success = await this._fetchInstitution();
			}
			if (success) {
				success = await this._fetchTheme();
			}
		}
		catch (error) {
			success = undefined;
		}
		return success;
	}

	async _fetchSirenEntity(url) {
		var request = new Request(url, {
			headers: new Headers({
				accept: 'application/vnd.siren+json',
				authorization: 'Bearer ' + this.token
			})
		});

		const response = await window.d2lfetch.fetch(request);
		if (response.ok) {
			return SirenParse(await response.json());
		}
		throw new Error(response.status);
	}

	async _fetchUser() {
		const userEntity = await this._fetchSirenEntity(this.userUrl);
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
		return userEntity;
	}

	async _fetchFolio() {
		if (!this.options || !this.options.background) {
			return undefined;
		}

		if (!this._folioUrl) {
			return undefined;
		}

		const folioEntity = await this._fetchSirenEntity(this._folioUrl);
		var tiles = (folioEntity.getSubEntitiesByRel(Rels.Folio.evidence));
		for (var i = 0; i < tiles.length; i++) {
			var content = tiles[i].getSubEntityByRel(Rels.Folio.contentItem);
			var type = content.properties.type;
			switch (type) {
				case 'Png':
				case 'Jpg':
				case 'Gif':
					this._backgroundUrl = content.properties.url;
					return true;
			}
		}
		return undefined;
	}

	async _fetchEnrollments() {
		if (!this._enrollmentsUrl) {
			return undefined;
		}

		this._enrollmentsUrl += '?pageSize=2&orgUnitTypeId=3&embedDepth=1';
		const enrollmentsEntity = await this._fetchSirenEntity(this._enrollmentsUrl);
		var enrollmentEntities = enrollmentsEntity.getSubEntitiesByRel(Rels.userEnrollment);

		if (enrollmentEntities.length === 1) {
			var organizationUrl = enrollmentEntities[0].getLinkByRel(Rels.organization).href;
			return organizationUrl;
		} else {
			return undefined;
		}
	}

	async _fetchOrganization(organizationUrl) {
		const organizationEntity = await this._fetchSirenEntity(organizationUrl);
		var imageLink = organizationEntity.getSubEntityByClass(Classes.courseImage.courseImage);

		if (!imageLink) {
			return undefined;
		}

		var organizationImageUrl = imageLink.href;
		return organizationImageUrl;
	}

	async _fetchOrganizationImage(organizationImageUrl) {
		const organizationImageEntity = await this._fetchSirenEntity(organizationImageUrl);
		var backgroundImages = this._getBestImageLinks(organizationImageEntity, Classes.courseImage.wide);
		this._backgroundUrl = backgroundImages.highMin || backgroundImages.lowMax;
		return organizationImageEntity;
	}

	async _fetchRoot() {
		if (!this._rootUrl) {
			return undefined;
		}

		const rootEntity = await this._fetchSirenEntity(this._rootUrl);

		var institutionUrl = (rootEntity.getLinkByRel(Rels.organization) || {}).href;
		return institutionUrl;
	}

	async _fetchInstitution(institutionUrl) {
		const institutionEntity = await this._fetchSirenEntity(institutionUrl);
		var themeUrl = (institutionEntity.getLinkByRel(Rels.Themes.theme) || {}).href;
		return themeUrl;
	}

	async _fetchTheme(themeUrl) {
		const themeEntity = await this._fetchSirenEntity(themeUrl);
		if (themeEntity.properties) {
			this._backgroundColor = themeEntity.properties.BackgroundColor;
		} else {
			return undefined;
		}
		return themeEntity;
	}
};
