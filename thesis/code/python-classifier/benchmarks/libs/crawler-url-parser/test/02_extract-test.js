const assert = require('assert');
const fs = require('fs');
const path = require('path');
const cup = require("../");

describe('extract url as internal, subdomain, external', function() {
    it('should extract urls at extract-test-html-01.html file', function() {
        let htmlPath = path.resolve(__dirname,'02_extract-test-html-01.html');
        let htmlString = fs.readFileSync(htmlPath,'utf-8');
        let result = cup.extract(htmlString,"http://www.stackoverflow.com/aaa/bbb/ccc");
        assert.equal(result.length,9);
    });
});
