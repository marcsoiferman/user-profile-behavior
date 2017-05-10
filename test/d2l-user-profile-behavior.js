/* global describe, it, expect, fixture, beforeEach */

'use strict';

describe('d2l-user-profile-behavior', function() {
	var component;

	beforeEach(function() {
		component = fixture('default-fixture');
	});

	it('should be properly imported by a consumer', function() {
		expect(component.generateUserRequest).to.be.an.instanceof(Function);
	});

});
