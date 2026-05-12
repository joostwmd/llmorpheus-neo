const assert = require('assert');
const cup = require("../");

//https://gist.github.com/paambaati/54d33e409b4f7cf059cc
describe('parse paths like "/aaa"', function () {

	it('should parse paths like "/aaa"', function () {
		let res = cup.parse("/aaa");
		assert.equal(res.url, "/aaa");
	});

	it('should parse paths like "/aaa#hhh"', function () {
		let res = cup.parse("/aaa#hhh");
		assert.equal(res.url, "/aaa");
	});

	it('should parse paths like "/aaa?q=query#hhh"', function () {
		let res = cup.parse("/aaa?q=query#hhh");
		assert.equal(res.url, "/aaa?q=query");
	});

	it('should parse paths like "/aaa?q1=query1&q2=query2#hhh"', function () {
		let res = cup.parse("/aaa?q1=query1&q2=query2#hhh");
		assert.equal(res.url, "/aaa?q1=query1&q2=query2");
	});

	it('should parse paths like "/aaa/bbb"', function () {
		let res = cup.parse("/aaa/bbb");
		assert.equal(res.url, "/aaa/bbb");
	});

	it('should parse paths like "/aaa/bbb#hhh"', function () {
		let res = cup.parse("/aaa/bbb#hhh");
		assert.equal(res.url, "/aaa/bbb");
	});

	it('should parse paths like "/aaa/bbb?q=query#hhh"', function () {
		let res = cup.parse("/aaa/bbb?q=query#hhh");
		assert.equal(res.url, "/aaa/bbb?q=query");
	});

	it('should parse paths like "/aaa/bbb?q1=query1&q2=query2#hhh"', function () {
		let res = cup.parse("/aaa/bbb?q1=query1&q2=query2#hhh");
		assert.equal(res.url, "/aaa/bbb?q1=query1&q2=query2");
	});

	it('should parse paths like "/aaa/"', function () {
		let res = cup.parse("/aaa/");
		assert.equal(res.url, "/aaa/");
	});

	it('should parse paths like "/aaa/#hhh"', function () {
		let res = cup.parse("/aaa/#hhh");
		assert.equal(res.url, "/aaa/");
	});

	it('should parse paths like "/aaa/bbb/"', function () {
		let res = cup.parse("/aaa/bbb/");
		assert.equal(res.url, "/aaa/bbb/");
	});

	it('should parse paths like "/aaa/bbb/#hhh"', function () {
		let res = cup.parse("/aaa/bbb/#hhh");
		assert.equal(res.url, "/aaa/bbb/");
	});

});

describe('parse paths like "aaa"', function () {

	it('should parse paths like "aaa"', function () {
		let res = cup.parse("aaa");
		assert.equal(res.url, "http://aaa/");
	});

	it('should parse paths like "aaa#hhh"', function () {
		let res = cup.parse("aaa#hhh");
		assert.equal(res.url, "http://aaa/");
	});

	it('should parse paths like "aaa?q=query#hhh"', function () {
		let res = cup.parse("aaa?q=query#hhh");
		assert.equal(res.url, "http://aaa/?q=query");
	});

	it('should parse paths like "aaa?q1=query1&q2=query2#hhh"', function () {
		let res = cup.parse("aaa?q1=query1&q2=query2#hhh");
		assert.equal(res.url, "http://aaa/?q1=query1&q2=query2");
	});

	it('should parse paths like "aaa/bbb"', function () {
		let res = cup.parse("aaa/bbb");
		assert.equal(res.url, "http://aaa/bbb");
	});

	it('should parse paths like "aaa/bbb#hhh"', function () {
		let res = cup.parse("aaa/bbb#hhh");
		assert.equal(res.url, "http://aaa/bbb");
	});

	it('should parse paths like "aaa/bbb?q=query#hhh"', function () {
		let res = cup.parse("aaa/bbb?q=query#hhh");
		assert.equal(res.url, "http://aaa/bbb?q=query");
	});

	it('should parse paths like "aaa/bbb?q1=query1&q2=query2#hhh"', function () {
		let res = cup.parse("aaa/bbb?q1=query1&q2=query2#hhh");
		assert.equal(res.url, "http://aaa/bbb?q1=query1&q2=query2");
	});

	it('should parse paths like "aaa/"', function () {
		let res = cup.parse("aaa/");
		assert.equal(res.url, "http://aaa/");
	});

	it('should parse paths like "aaa/#hhh"', function () {
		let res = cup.parse("aaa/#hhh");
		assert.equal(res.url, "http://aaa/");
	});

	it('should parse paths like "aaa/bbb/"', function () {
		let res = cup.parse("aaa/bbb/");
		assert.equal(res.url, "http://aaa/bbb/");
	});

	it('should parse paths like "aaa/bbb/#hhh"', function () {
		let res = cup.parse("aaa/bbb/#hhh");
		assert.equal(res.url, "http://aaa/bbb/");
	});

});

describe('parse paths like "../aaa"', function () {

	it('should parse paths like "../aaa"', function () {
		let res = cup.parse("../aaa");
		assert.equal(res.url, "../aaa");
	});

	it('should parse paths like "../aaa#hhh"', function () {
		let res = cup.parse("../aaa#hhh");
		assert.equal(res.url, "../aaa");
	});

	it('should parse paths like "../aaa?q=query#hhh"', function () {
		let res = cup.parse("../aaa?q=query#hhh");
		assert.equal(res.url, "../aaa?q=query");
	});

	it('should parse paths like "../aaa?q1=query1&q2=query2#hhh"', function () {
		let res = cup.parse("../aaa?q1=query1&q2=query2#hhh");
		assert.equal(res.url, "../aaa?q1=query1&q2=query2");
	});

	it('should parse paths like "../aaa/bbb"', function () {
		let res = cup.parse("../aaa/bbb");
		assert.equal(res.url, "../aaa/bbb");
	});

	it('should parse paths like "../aaa/bbb#hhh"', function () {
		let res = cup.parse("../aaa/bbb#hhh");
		assert.equal(res.url, "../aaa/bbb");
	});

	it('should parse paths like "../aaa/bbb?q=query#hhh"', function () {
		let res = cup.parse("../aaa/bbb?q=query#hhh");
		assert.equal(res.url, "../aaa/bbb?q=query");
	});

	it('should parse paths like "../aaa/bbb?q1=query1&q2=query2#hhh"', function () {
		let res = cup.parse("../aaa/bbb?q1=query1&q2=query2#hhh");
		assert.equal(res.url, "../aaa/bbb?q1=query1&q2=query2");
	});

	it('should parse paths like "../aaa/"', function () {
		let res = cup.parse("../aaa/");
		assert.equal(res.url, "../aaa/");
	});

	it('should parse paths like "../aaa/#hhh"', function () {
		let res = cup.parse("../aaa/#hhh");
		assert.equal(res.url, "../aaa/");
	});

	it('should parse paths like "../aaa/bbb/"', function () {
		let res = cup.parse("../aaa/bbb/");
		assert.equal(res.url, "../aaa/bbb/");
	});

	it('should parse paths like "../aaa/bbb/#hhh"', function () {
		let res = cup.parse("../aaa/bbb/#hhh");
		assert.equal(res.url, "../aaa/bbb/");
	});

});

describe('parse paths with subdomain "http://www.google.com"', function () {
	it('should remove default subdomain "http://www.google.com"', function () {
		let res = cup.parse("http://www.google.com");
		assert.equal(res.url, "http://www.google.com/");
	});

	it('should not remove subdomain except default subdomain "http://mail.google.com"', function () {
		let res = cup.parse("http://mail.google.com");
		assert.equal(res.url, "http://mail.google.com/");
	});

	it('should remove default subdomain "http://www.google.com/aaa"', function () {
		let res = cup.parse("http://www.google.com/aaa");
		assert.equal(res.url, "http://www.google.com/aaa");
	});

	it('should not remove subdomain except default subdomain "http://mail.google.com/aaa"', function () {
		let res = cup.parse("http://mail.google.com/aaa");
		assert.equal(res.url, "http://mail.google.com/aaa");
	});

	it('should remove default subdomain "http://www.google.com/aaa?q=query"', function () {
		let res = cup.parse("http://www.google.com/aaa?q=query");
		assert.equal(res.url, "http://www.google.com/aaa?q=query");
	});

	it('should not remove subdomain except default subdomain "http://mail.google.com/aaa?q=query"', function () {
		let res = cup.parse("http://mail.google.com/aaa?q=query");
		assert.equal(res.url, "http://mail.google.com/aaa?q=query");
	});

	it('should remove default subdomain "http://www.google.com/aaa?q1=query1&q2=query2"', function () {
		let res = cup.parse("http://www.google.com/aaa?q=query?q1=query1&q2=query2");
		assert.equal(res.url, "http://www.google.com/aaa?q=query?q1=query1&q2=query2");
	});

	it('should not remove subdomain except default subdomain "http://mail.google.com/aaa?q=query?q1=query1&q2=query2"', function () {
		let res = cup.parse("http://mail.google.com/aaa?q=query?q1=query1&q2=query2");
		assert.equal(res.url, "http://mail.google.com/aaa?q=query?q1=query1&q2=query2");
	});
});

describe('parse paths with subdomain "https://www.google.com"', function () {
	it('should remove default subdomain "https://www.google.com"', function () {
		let res = cup.parse("https://www.google.com");
		assert.equal(res.url, "https://www.google.com/");
	});

	it('should not remove subdomain except default subdomain "https://mail.google.com"', function () {
		let res = cup.parse("https://mail.google.com");
		assert.equal(res.url, "https://mail.google.com/");
	});

	it('should remove default subdomain "https://www.google.com/aaa"', function () {
		let res = cup.parse("https://www.google.com/aaa");
		assert.equal(res.url, "https://www.google.com/aaa");
	});

	it('should not remove subdomain except default subdomain "https://mail.google.com/aaa"', function () {
		let res = cup.parse("https://mail.google.com/aaa");
		assert.equal(res.url, "https://mail.google.com/aaa");
	});

	it('should remove default subdomain "https://www.google.com/aaa?q=query"', function () {
		let res = cup.parse("https://www.google.com/aaa?q=query");
		assert.equal(res.url, "https://www.google.com/aaa?q=query");
	});

	it('should not remove subdomain except default subdomain "https://mail.google.com/aaa?q=query"', function () {
		let res = cup.parse("https://mail.google.com/aaa?q=query");
		assert.equal(res.url, "https://mail.google.com/aaa?q=query");
	});

	it('should remove default subdomain "https://www.google.com/aaa?q1=query1&q2=query2"', function () {
		let res = cup.parse("https://www.google.com/aaa?q=query?q1=query1&q2=query2");
		assert.equal(res.url, "https://www.google.com/aaa?q=query?q1=query1&q2=query2");
	});

	it('should not remove subdomain except default subdomain "https://mail.google.com/aaa?q=query?q1=query1&q2=query2"', function () {
		let res = cup.parse("https://mail.google.com/aaa?q=query?q1=query1&q2=query2");
		assert.equal(res.url, "https://mail.google.com/aaa?q=query?q1=query1&q2=query2");
	});
});

describe('parse paths with invalid protocol "ftp://www.google.com"', function () {

	it('should be null "ftp://www.google.com"', function () {
		let res = cup.parse("ftp://www.google.com");
		assert.equal(res, null);
	});

});

describe('parse paths with invalid protocol "htp://www.google.com"', function () {

	it('should be null "htp://www.google.com"', function () {
		let res = cup.parse("htp://www.google.com");
		assert.equal(res, null);
	});

	it('should be null "htp://mail.google.com"', function () {
		let res = cup.parse("htp://mail.google.com");
		assert.equal(res, null);
	});

	it('should be null "htp://www.google.com/aaa"', function () {
		let res = cup.parse("htp://www.google.com/aaa");
		assert.equal(res, null);
	});

	it('should be null "htp://mail.google.com/aaa"', function () {
		let res = cup.parse("htp://mail.google.com/aaa");
		assert.equal(res, null);
	});

	it('should be null "htp://www.google.com/aaa?q=query"', function () {
		let res = cup.parse("htp://www.google.com/aaa?q=query");
		assert.equal(res, null);
	});

	it('should be null "htp://mail.google.com/aaa?q=query"', function () {
		let res = cup.parse("htp://mail.google.com/aaa?q=query");
		assert.equal(res, null);
	});

	it('should be null "htp://www.google.com/aaa?q1=query1&q2=query2"', function () {
		let res = cup.parse("htp://www.google.com/aaa?q=query?q1=query1&q2=query2");
		assert.equal(res, null);
	});

	it('should be null "htp://mail.google.com/aaa?q=query?q1=query1&q2=query2"', function () {
		let res = cup.parse("htp://mail.google.com/aaa?q=query?q1=query1&q2=query2");
		assert.equal(res, null);
	});
});

describe('parse paths with subdomain "http://www.google.com" also have base url', function () {
	it('should remove default subdomain "http://www.google.com"', function () {
		let res = cup.parse("http://www.google.com", "http://www.facebook.com");
		assert.equal(res.url, "http://www.google.com/");
	});

	it('should not remove subdomain except default subdomain "http://mail.google.com"', function () {
		let res = cup.parse("http://mail.google.com", "http://www.facebook.com");
		assert.equal(res.url, "http://mail.google.com/");
	});

	it('should remove default subdomain "http://www.google.com/aaa"', function () {
		let res = cup.parse("http://www.google.com/aaa", "http://www.facebook.com");
		assert.equal(res.url, "http://www.google.com/aaa");
	});

	it('should not remove subdomain except default subdomain "http://mail.google.com/aaa"', function () {
		let res = cup.parse("http://mail.google.com/aaa", "http://www.facebook.com");
		assert.equal(res.url, "http://mail.google.com/aaa");
	});

	it('should remove default subdomain "http://www.google.com/aaa?q=query"', function () {
		let res = cup.parse("http://www.google.com/aaa?q=query", "http://www.facebook.com");
		assert.equal(res.url, "http://www.google.com/aaa?q=query");
	});

	it('should not remove subdomain except default subdomain "http://mail.google.com/aaa?q=query"', function () {
		let res = cup.parse("http://mail.google.com/aaa?q=query", "http://www.facebook.com");
		assert.equal(res.url, "http://mail.google.com/aaa?q=query");
	});

	it('should remove default subdomain "http://www.google.com/aaa?q1=query1&q2=query2"', function () {
		let res = cup.parse("http://www.google.com/aaa?q=query?q1=query1&q2=query2", "http://www.facebook.com");
		assert.equal(res.url, "http://www.google.com/aaa?q=query?q1=query1&q2=query2");
	});

	it('should not remove subdomain except default subdomain "http://mail.google.com/aaa?q=query?q1=query1&q2=query2"', function () {
		let res = cup.parse("http://mail.google.com/aaa?q=query?q1=query1&q2=query2", "http://www.facebook.com");
		assert.equal(res.url, "http://mail.google.com/aaa?q=query?q1=query1&q2=query2");
	});
});

describe('parse paths with subdomain "https://www.google.com" also have base url', function () {
	it('should remove default subdomain "https://www.google.com"', function () {
		let res = cup.parse("https://www.google.com", "http://www.facebook.com");
		assert.equal(res.url, "https://www.google.com/");
	});

	it('should not remove subdomain except default subdomain "https://mail.google.com"', function () {
		let res = cup.parse("https://mail.google.com", "http://www.facebook.com");
		assert.equal(res.url, "https://mail.google.com/");
	});

	it('should remove default subdomain "https://www.google.com/aaa"', function () {
		let res = cup.parse("https://www.google.com/aaa", "http://www.facebook.com");
		assert.equal(res.url, "https://www.google.com/aaa");
	});

	it('should not remove subdomain except default subdomain "https://mail.google.com/aaa"', function () {
		let res = cup.parse("https://mail.google.com/aaa", "http://www.facebook.com");
		assert.equal(res.url, "https://mail.google.com/aaa");
	});

	it('should remove default subdomain "https://www.google.com/aaa?q=query"', function () {
		let res = cup.parse("https://www.google.com/aaa?q=query", "http://www.facebook.com");
		assert.equal(res.url, "https://www.google.com/aaa?q=query");
	});

	it('should not remove subdomain except default subdomain "https://mail.google.com/aaa?q=query"', function () {
		let res = cup.parse("https://mail.google.com/aaa?q=query", "http://www.facebook.com");
		assert.equal(res.url, "https://mail.google.com/aaa?q=query");
	});

	it('should remove default subdomain "https://www.google.com/aaa?q1=query1&q2=query2"', function () {
		let res = cup.parse("https://www.google.com/aaa?q=query?q1=query1&q2=query2", "http://www.facebook.com");
		assert.equal(res.url, "https://www.google.com/aaa?q=query?q1=query1&q2=query2");
	});

	it('should not remove subdomain except default subdomain "https://mail.google.com/aaa?q=query?q1=query1&q2=query2"', function () {
		let res = cup.parse("https://mail.google.com/aaa?q=query?q1=query1&q2=query2", "http://www.facebook.com");
		assert.equal(res.url, "https://mail.google.com/aaa?q=query?q1=query1&q2=query2");
	});
});

describe('parse paths with invalid protocol "htp://www.google.com" also have base url', function () {
	it('should be null "htp://www.google.com"', function () {
		let res = cup.parse("htp://www.google.com", "http://www.facebook.com");
		assert.equal(res, null);
	});

	it('should be null "htp://mail.google.com"', function () {
		let res = cup.parse("htp://mail.google.com", "http://www.facebook.com");
		assert.equal(res, null);
	});

	it('should be null "htp://www.google.com/aaa"', function () {
		let res = cup.parse("htp://www.google.com/aaa", "http://www.facebook.com");
		assert.equal(res, null);
	});

	it('should be null "htp://mail.google.com/aaa"', function () {
		let res = cup.parse("htp://mail.google.com/aaa", "http://www.facebook.com");
		assert.equal(res, null);
	});

	it('should be null "htp://www.google.com/aaa?q=query"', function () {
		let res = cup.parse("htp://www.google.com/aaa?q=query", "http://www.facebook.com");
		assert.equal(res, null);
	});

	it('should be null "htp://mail.google.com/aaa?q=query"', function () {
		let res = cup.parse("htp://mail.google.com/aaa?q=query", "http://www.facebook.com");
		assert.equal(res, null);
	});

	it('should be null "htp://www.google.com/aaa?q1=query1&q2=query2"', function () {
		let res = cup.parse("htp://www.google.com/aaa?q=query?q1=query1&q2=query2", "http://www.facebook.com");
		assert.equal(res, null);
	});

	it('should be null "htp://mail.google.com/aaa?q=query?q1=query1&q2=query2"', function () {
		let res = cup.parse("htp://mail.google.com/aaa?q=query?q1=query1&q2=query2", "http://www.facebook.com");
		assert.equal(res, null);
	});
});

describe('parse paths with subdomain "http://www.google.com" also have invalid base url', function () {


	it('should fail for invalid chars "http://www.google.com"', function () {
		let res = cup.parse("http://www.google.com", "#öööö");
		assert.equal(res, null);
	});

	it('should fail for invalid chars "http://mail.google.com"', function () {
		let res = cup.parse("http: //mail.google.com", "#abcd");
		assert.equal(res, null);
	});

	it('should remove default subdomain "http://www.google.com"', function () {
		let res = cup.parse("http://www.google.com", "#abcd");
		assert.equal(res.url, "http://www.google.com/");
	});

	it('should not remove subdomain except default subdomain "http://mail.google.com"', function () {
		let res = cup.parse("http://mail.google.com", "#abcd");
		assert.equal(res.url, "http://mail.google.com/");
	});

	it('should remove default subdomain "http://www.google.com/aaa"', function () {
		let res = cup.parse("http://www.google.com/aaa", "#abcd");
		assert.equal(res.url, "http://www.google.com/aaa");
	});

	it('should not remove subdomain except default subdomain "http://mail.google.com/aaa"', function () {
		let res = cup.parse("http://mail.google.com/aaa", "#abcd");
		assert.equal(res.url, "http://mail.google.com/aaa");
	});

	it('should remove default subdomain "http://www.google.com/aaa?q=query"', function () {
		let res = cup.parse("http://www.google.com/aaa?q=query", "#abcd");
		assert.equal(res.url, "http://www.google.com/aaa?q=query");
	});

	it('should not remove subdomain except default subdomain "http://mail.google.com/aaa?q=query"', function () {
		let res = cup.parse("http://mail.google.com/aaa?q=query", "#abcd");
		assert.equal(res.url, "http://mail.google.com/aaa?q=query");
	});

	it('should remove default subdomain "http://www.google.com/aaa?q1=query1&q2=query2"', function () {
		let res = cup.parse("http://www.google.com/aaa?q=query?q1=query1&q2=query2", "#abcd");
		assert.equal(res.url, "http://www.google.com/aaa?q=query?q1=query1&q2=query2");
	});

	it('should not remove subdomain except default subdomain "http://mail.google.com/aaa?q=query?q1=query1&q2=query2"', function () {
		let res = cup.parse("http://mail.google.com/aaa?q=query?q1=query1&q2=query2", "#abcd");
		assert.equal(res.url, "http://mail.google.com/aaa?q=query?q1=query1&q2=query2");
	});
});


describe('parse paths with subdomain "https://www.google.com" also have invalid base url', function () {
	it('should remove default subdomain "https://www.google.com"', function () {
		let res = cup.parse("https://www.google.com", "#abcd");
		assert.equal(res.url, "https://www.google.com/");
	});

	it('should not remove subdomain except default subdomain "https://mail.google.com"', function () {
		let res = cup.parse("https://mail.google.com", "#abcd");
		assert.equal(res.url, "https://mail.google.com/");
	});

	it('should remove default subdomain "https://www.google.com/aaa"', function () {
		let res = cup.parse("https://www.google.com/aaa", "#abcd");
		assert.equal(res.url, "https://www.google.com/aaa");
	});

	it('should not remove subdomain except default subdomain "https://mail.google.com/aaa"', function () {
		let res = cup.parse("https://mail.google.com/aaa", "#abcd");
		assert.equal(res.url, "https://mail.google.com/aaa");
	});

	it('should remove default subdomain "https://www.google.com/aaa?q=query"', function () {
		let res = cup.parse("https://www.google.com/aaa?q=query", "#abcd");
		assert.equal(res.url, "https://www.google.com/aaa?q=query");
	});

	it('should not remove subdomain except default subdomain "https://mail.google.com/aaa?q=query"', function () {
		let res = cup.parse("https://mail.google.com/aaa?q=query", "#abcd");
		assert.equal(res.url, "https://mail.google.com/aaa?q=query");
	});

	it('should remove default subdomain "https://www.google.com/aaa?q1=query1&q2=query2"', function () {
		let res = cup.parse("https://www.google.com/aaa?q=query?q1=query1&q2=query2", "#abcd");
		assert.equal(res.url, "https://www.google.com/aaa?q=query?q1=query1&q2=query2");
	});

	it('should not remove subdomain except default subdomain "https://mail.google.com/aaa?q=query?q1=query1&q2=query2"', function () {
		let res = cup.parse("https://mail.google.com/aaa?q=query?q1=query1&q2=query2", "#abcd");
		assert.equal(res.url, "https://mail.google.com/aaa?q=query?q1=query1&q2=query2");
	});
});


describe('parse paths with invalid protocol "htp://www.google.com" also have invalid base url', function () {
	it('should be null "htp://www.google.com"', function () {
		let res = cup.parse("htp://www.google.com", "#abcd");
		assert.equal(res, null);
	});

	it('should be null "htp://mail.google.com"', function () {
		let res = cup.parse("htp://mail.google.com", "#abcd");
		assert.equal(res, null);
	});

	it('should be null "htp://www.google.com/aaa"', function () {
		let res = cup.parse("htp://www.google.com/aaa", "#abcd");
		assert.equal(res, null);
	});

	it('should be null "htp://mail.google.com/aaa"', function () {
		let res = cup.parse("htp://mail.google.com/aaa", "#abcd");
		assert.equal(res, null);
	});

	it('should be null "htp://www.google.com/aaa?q=query"', function () {
		let res = cup.parse("htp://www.google.com/aaa?q=query", "#abcd");
		assert.equal(res, null);
	});

	it('should be null "htp://mail.google.com/aaa?q=query"', function () {
		let res = cup.parse("htp://mail.google.com/aaa?q=query", "#abcd");
		assert.equal(res, null);
	});

	it('should be null "htp://www.google.com/aaa?q1=query1&q2=query2"', function () {
		let res = cup.parse("htp://www.google.com/aaa?q=query?q1=query1&q2=query2", "#abcd");
		assert.equal(res, null);
	});

	it('should be null "htp://mail.google.com/aaa?q=query?q1=query1&q2=query2"', function () {
		let res = cup.parse("htp://mail.google.com/aaa?q=query?q1=query1&q2=query2", "#abcd");
		assert.equal(res, null);
	});
});


describe('parse paths with subdomain "http://www.google.com" also have invalid base url', function () {
	it('should remove default subdomain "http://www.google.com"', function () {
		let res = cup.parse("http://www.google.com", "");
		assert.equal(res.url, "http://www.google.com/");
	});

	it('should not remove subdomain except default subdomain "http://mail.google.com"', function () {
		let res = cup.parse("http://mail.google.com", "");
		assert.equal(res.url, "http://mail.google.com/");
	});

	it('should remove default subdomain "http://www.google.com/aaa"', function () {
		let res = cup.parse("http://www.google.com/aaa", "");
		assert.equal(res.url, "http://www.google.com/aaa");
	});

	it('should not remove subdomain except default subdomain "http://mail.google.com/aaa"', function () {
		let res = cup.parse("http://mail.google.com/aaa", "");
		assert.equal(res.url, "http://mail.google.com/aaa");
	});

	it('should remove default subdomain "http://www.google.com/aaa?q=query"', function () {
		let res = cup.parse("http://www.google.com/aaa?q=query", "");
		assert.equal(res.url, "http://www.google.com/aaa?q=query");
	});

	it('should not remove subdomain except default subdomain "http://mail.google.com/aaa?q=query"', function () {
		let res = cup.parse("http://mail.google.com/aaa?q=query", "");
		assert.equal(res.url, "http://mail.google.com/aaa?q=query");
	});

	it('should remove default subdomain "http://www.google.com/aaa?q1=query1&q2=query2"', function () {
		let res = cup.parse("http://www.google.com/aaa?q=query?q1=query1&q2=query2", "");
		assert.equal(res.url, "http://www.google.com/aaa?q=query?q1=query1&q2=query2");
	});

	it('should not remove subdomain except default subdomain "http://mail.google.com/aaa?q=query?q1=query1&q2=query2"', function () {
		let res = cup.parse("http://mail.google.com/aaa?q=query?q1=query1&q2=query2", "");
		assert.equal(res.url, "http://mail.google.com/aaa?q=query?q1=query1&q2=query2");
	});
});


describe('parse paths with subdomain "https://www.google.com" also have invalid base url', function () {
	it('should remove default subdomain "https://www.google.com"', function () {
		let res = cup.parse("https://www.google.com", "");
		assert.equal(res.url, "https://www.google.com/");
	});

	it('should not remove subdomain except default subdomain "https://mail.google.com"', function () {
		let res = cup.parse("https://mail.google.com", "");
		assert.equal(res.url, "https://mail.google.com/");
	});

	it('should remove default subdomain "https://www.google.com/aaa"', function () {
		let res = cup.parse("https://www.google.com/aaa", "");
		assert.equal(res.url, "https://www.google.com/aaa");
	});

	it('should not remove subdomain except default subdomain "https://mail.google.com/aaa"', function () {
		let res = cup.parse("https://mail.google.com/aaa", "");
		assert.equal(res.url, "https://mail.google.com/aaa");
	});

	it('should remove default subdomain "https://www.google.com/aaa?q=query"', function () {
		let res = cup.parse("https://www.google.com/aaa?q=query", "");
		assert.equal(res.url, "https://www.google.com/aaa?q=query");
	});

	it('should not remove subdomain except default subdomain "https://mail.google.com/aaa?q=query"', function () {
		let res = cup.parse("https://mail.google.com/aaa?q=query", "");
		assert.equal(res.url, "https://mail.google.com/aaa?q=query");
	});

	it('should remove default subdomain "https://www.google.com/aaa?q1=query1&q2=query2"', function () {
		let res = cup.parse("https://www.google.com/aaa?q=query?q1=query1&q2=query2", "");
		assert.equal(res.url, "https://www.google.com/aaa?q=query?q1=query1&q2=query2");
	});

	it('should not remove subdomain except default subdomain "https://mail.google.com/aaa?q=query?q1=query1&q2=query2"', function () {
		let res = cup.parse("https://mail.google.com/aaa?q=query?q1=query1&q2=query2", "");
		assert.equal(res.url, "https://mail.google.com/aaa?q=query?q1=query1&q2=query2");
	});
});


describe('parse paths with invalid protocol "htp://www.google.com" also have invalid base url', function () {
	it('should be null "htp://www.google.com"', function () {
		let res = cup.parse("htp://www.google.com", "");
		assert.equal(res, null);
	});

	it('should be null "htp://mail.google.com"', function () {
		let res = cup.parse("htp://mail.google.com", "");
		assert.equal(res, null);
	});

	it('should be null "htp://www.google.com/aaa"', function () {
		let res = cup.parse("htp://www.google.com/aaa", "");
		assert.equal(res, null);
	});

	it('should be null "htp://mail.google.com/aaa"', function () {
		let res = cup.parse("htp://mail.google.com/aaa", "");
		assert.equal(res, null);
	});

	it('should be null "htp://www.google.com/aaa?q=query"', function () {
		let res = cup.parse("htp://www.google.com/aaa?q=query", "");
		assert.equal(res, null);
	});

	it('should be null "htp://mail.google.com/aaa?q=query"', function () {
		let res = cup.parse("htp://mail.google.com/aaa?q=query", "");
		assert.equal(res, null);
	});

	it('should be null "htp://www.google.com/aaa?q1=query1&q2=query2"', function () {
		let res = cup.parse("htp://www.google.com/aaa?q=query?q1=query1&q2=query2", "");
		assert.equal(res, null);
	});

	it('should be null "htp://mail.google.com/aaa?q=query?q1=query1&q2=query2"', function () {
		let res = cup.parse("htp://mail.google.com/aaa?q=query?q1=query1&q2=query2", "");
		assert.equal(res, null);
	});
});


describe('parse paths with subdomain "www.google.com" also have base url', function () {
	it('should remove default subdomain "www.google.com"', function () {
		let res = cup.parse("www.google.com", "http://www.facebook.com");
		assert.equal(res.url, "http://www.facebook.com/www.google.com");
	});

	it('should not remove subdomain except default subdomain "mail.google.com"', function () {
		let res = cup.parse("mail.google.com", "http://www.facebook.com");
		assert.equal(res.url, "http://www.facebook.com/mail.google.com");
	});

	it('should remove default subdomain "www.google.com/aaa"', function () {
		let res = cup.parse("www.google.com/aaa", "http://www.facebook.com");
		assert.equal(res.url, "http://www.facebook.com/www.google.com/aaa");
	});

	it('should not remove subdomain except default subdomain "mail.google.com/aaa"', function () {
		let res = cup.parse("mail.google.com/aaa", "http://www.facebook.com");
		assert.equal(res.url, "http://www.facebook.com/mail.google.com/aaa");
	});

	it('should remove default subdomain "www.google.com/aaa?q=query"', function () {
		let res = cup.parse("www.google.com/aaa?q=query", "http://www.facebook.com");
		assert.equal(res.url, "http://www.facebook.com/www.google.com/aaa?q=query");
	});

	it('should not remove subdomain except default subdomain "mail.google.com/aaa?q=query"', function () {
		let res = cup.parse("mail.google.com/aaa?q=query", "http://www.facebook.com");
		assert.equal(res.url, "http://www.facebook.com/mail.google.com/aaa?q=query");
	});

	it('should remove default subdomain "www.google.com/aaa?q1=query1&q2=query2"', function () {
		let res = cup.parse("www.google.com/aaa?q=query?q1=query1&q2=query2", "http://www.facebook.com");
		assert.equal(res.url, "http://www.facebook.com/www.google.com/aaa?q=query?q1=query1&q2=query2");
	});

	it('should not remove subdomain except default subdomain "mail.google.com/aaa?q=query?q1=query1&q2=query2"', function () {
		let res = cup.parse("mail.google.com/aaa?q=query?q1=query1&q2=query2", "http://www.facebook.com");
		assert.equal(res.url, "http://www.facebook.com/mail.google.com/aaa?q=query?q1=query1&q2=query2");
	});
});

describe('parse as null unknown protocols', function () {
	it('should null for ftp', function () {
		let res = cup.parse("ftp://www.stackoverflow.com/questions.exe");
		assert.equal(res, null);
	});

	it('should http for non-protocol urls', function () {
		let res = cup.parse("www.stackoverflow.com/questions.exe");
		assert.equal(res.url, "http://www.stackoverflow.com/questions.exe");
	});

	it('should http for short urls', function () {
		let res = cup.parse("//www.stackoverflow.com/questions.exe");
		assert.equal(res.url, "http://www.stackoverflow.com/questions.exe");
	});
});


describe('parse ralative url with base path', function () {
	it('should parse paths like "/ddd" with baseurl', function () {
		let res = cup.parse("/ddd", "//www.stackoverflow.com/aaa/bbb/ccc");
		//http://www.stackoverflow.com/ddd check parse-test-html-01.html
		assert.equal(res.url, "http://www.stackoverflow.com/ddd");
	});

	it('should parse paths like "ddd" with baseurl', function () {
		let res = cup.parse("ddd", "//www.stackoverflow.com/aaa/bbb/ccc");
		//http://www.stackoverflow.com/aaa/bbb/ddd check parse-test-html-01.html
		assert.equal(res.url, "http://www.stackoverflow.com/aaa/bbb/ddd");
	});


	it('should parse paths like "./ddd" with baseurl', function () {
		let res = cup.parse("./ddd", "//www.stackoverflow.com/aaa/bbb/ccc");
		//http://www.stackoverflow.com/aaa/bbb/ddd check parse-test-html-01.html
		assert.equal(res.url, "http://www.stackoverflow.com/aaa/bbb/ddd");
	});


	it('should parse paths like "../ddd" with baseurl', function () {
		let res = cup.parse("../ddd", "//www.stackoverflow.com/aaa/bbb/ccc");
		//http://www.stackoverflow.com/aaa/ddd check parse-test-html-01.html
		assert.equal(res.url, "http://www.stackoverflow.com/aaa/ddd");
	});


	it('should parse paths like "/ddd" with baseurl end with "/"', function () {
		let res = cup.parse("/ddd", "http://www.stackoverflow.com/aaa/bbb/ccc/");
		//http://www.stackoverflow.com/ddd check parse-test-html-02.html
		assert.equal(res.url, "http://www.stackoverflow.com/ddd");
	});

	it('should parse paths like "ddd" with baseurl end with "/"', function () {
		let res = cup.parse("ddd", "http://www.stackoverflow.com/aaa/bbb/ccc/");
		//http://www.stackoverflow.com/aaa/bbb/ccc/ddd check parse-test-html-02.html
		assert.equal(res.url, "http://www.stackoverflow.com/aaa/bbb/ccc/ddd");
	});


	it('should parse paths like "./ddd" with baseurl end with "/"', function () {
		let res = cup.parse("./ddd", "http://www.stackoverflow.com/aaa/bbb/ccc/");
		//http://www.stackoverflow.com/aaa/bbb/ccc/ddd check parse-test-html-02.html
		assert.equal(res.url, "http://www.stackoverflow.com/aaa/bbb/ccc/ddd");
	});


	it('should parse paths like "../ddd" with baseurl end with "/"', function () {
		let res = cup.parse("../ddd", "http://www.stackoverflow.com/aaa/bbb/ccc/");
		//http://www.stackoverflow.com/aaa/bbb/ddd check parse-test-html-02.html
		assert.equal(res.url, "http://www.stackoverflow.com/aaa/bbb/ddd");
	});

});
