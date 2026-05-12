const assert = require('assert');
const cup = require("../");
const cr = require("crawler-request");


describe('crawler test 01', function () {
	this.timeout(10000);
	let url = 'https://github.com/Microsoft';
	it(`should pass for ${url}`, function () {

		let res = cup.parse("#start-of-content", url);
		assert.equal(res.url, "https://github.com/Microsoft");

	});

});

describe('crawler test 02', function () {
	this.timeout(10000);
	let url = 'http://journals.tubitak.gov.tr';
	it(`should pass for ${url}`, function () {
		return cr(url).then(function (result) {
			let urls = cup.extract(result.html, url);
			assert.notEqual(urls.length, 0);
		});
	});

});


describe('crawler test 03', function () {
	this.timeout(10000);
	let url = 'http://journals.tubitak.gov.tr/';
	it(`should pass for ${url}`, function () {
		return cr(url).then(function (result) {
			let urls = cup.extract(result.html, url);
			assert.notEqual(urls.length, 0);
		});
	});
});


describe('crawler test 04', function () {
	this.timeout(10000);
	let url = 'https://github.com/Microsoft';
	it(`should pass for ${url}`, function () {
		return cr(url).then(function (result) {
			let urls = cup.extract(result.html, url);
			assert.notEqual(urls.length, 0);
		});
	});
});


describe('crawler test 05', function () {
	this.timeout(10000);
	let url = 'https://github.com/Microsoft/';
	it(`should pass for ${url}`, function () {
		return cr(url).then(function (result) {
			let urls = cup.extract(result.html, url);
			assert.notEqual(urls.length, 0);
		});
	});
});


describe('crawler test 06', function () {
	this.timeout(10000);
	let url = 'https://www.npmjs.com/package/electron-window-manager';
	it(`should pass for ${url}`, function () {
		return cr(url).then(function (result) {
			debugger;
			let urls = cup.extract(result.html, url);
			assert.notEqual(urls.length, 0);
		});
	});
});


describe('crawler test 06', function () {
	this.timeout(10000);
	let url = 'https://www.npmjs.com/package/electron-window-manager';
	it(`should pass for ${url}`, function () {
		return cr(url).then(function (result) {
			debugger;
			let urls = cup.extract(result.html, url);
			assert.notEqual(urls.length, 0);
		});
	});
});
