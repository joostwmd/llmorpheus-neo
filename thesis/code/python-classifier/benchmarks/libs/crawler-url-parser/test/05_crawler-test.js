const assert = require('assert');
const cup = require("../");
var CrawlerRequest = require('crawler-request');
const fs = require('fs');
const path = require('path');

describe('05 static html', function() {

    it('should pass 05 static html', function() {
        let htmlPath = path.resolve(__dirname,'05_tubitak.html');
        let htmlString = fs.readFileSync(htmlPath,'utf-8');
        let result = cup.extract(htmlString,"http://journals.tubitak.gov.tr/");
        //todo ///
        let suplevelArr = result.filter((el, index, arr) => el.type == "sublevel");
        let uplevelArr = result.filter((el, index, arr) => el.type == "uplevel");
        let samelevelArr = result.filter((el, index, arr) => el.type == "samelevel");
        let internalArr = result.filter((el, index, arr) => el.type == "internal");
        let subdomainArr = result.filter((el, index, arr) => el.type == "subdomain");
        let updomainArr = result.filter((el, index, arr) => el.type == "updomain");
        let externalArr = result.filter((el, index, arr) => el.type == "external");
        assert.equal(result.length,34);
        assert.equal(suplevelArr.length+uplevelArr.length+samelevelArr.length+internalArr.length+subdomainArr.length+updomainArr.length+externalArr.length,34);
        assert.equal(suplevelArr.length,12);
        assert.equal(uplevelArr.length,0);
        assert.equal(samelevelArr.length,1);
        assert.equal(internalArr.length,13);
        assert.equal(subdomainArr.length,2);
        assert.equal(updomainArr.length,1);
        assert.equal(externalArr.length,5);
    });
});
