const assert = require('assert');
const cup = require("../");
const fs = require('fs');
const path = require('path');

describe('06 static html type test', function() {

    it('should pass 06 static html type test', function() {
        let htmlPath = path.resolve(__dirname,'06_type-test.html');
        let htmlString = fs.readFileSync(htmlPath,'utf-8');
        let result = cup.extract(htmlString);

        let suplevelArr = result.filter((el, index, arr) => el.type == "sublevel");
        let uplevelArr = result.filter((el, index, arr) => el.type == "uplevel");
        let samelevelArr = result.filter((el, index, arr) => el.type == "samelevel");
        let internalArr = result.filter((el, index, arr) => el.type == "internal");
        let subdomainArr = result.filter((el, index, arr) => el.type == "subdomain");
        let updomainArr = result.filter((el, index, arr) => el.type == "updomain");
        let externalArr = result.filter((el, index, arr) => el.type == "external");
        assert.equal(result.length,12);
        assert.equal(suplevelArr.length+uplevelArr.length+samelevelArr.length+internalArr.length+subdomainArr.length+updomainArr.length+externalArr.length,12);
        assert.equal(suplevelArr.length,2);
        assert.equal(uplevelArr.length,1);
        assert.equal(samelevelArr.length,2);
        assert.equal(internalArr.length,2);
        assert.equal(subdomainArr.length,1);
        assert.equal(updomainArr.length,2);
        assert.equal(externalArr.length,2);
    });
});
