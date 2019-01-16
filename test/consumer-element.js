import '../d2l-user-profile-behavior.js';
import { Polymer } from '@polymer/polymer/lib/legacy/polymer-fn.js';
Polymer({
	is: 'consumer-element',
	behaviors: [
		window.D2L.UserProfileBehavior
	]
});
