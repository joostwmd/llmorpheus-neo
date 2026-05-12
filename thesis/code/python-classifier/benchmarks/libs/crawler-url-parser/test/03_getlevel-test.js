const assert = require('assert');
const cup = require("../");

describe('gettype url as samelevel, sublevel, uplevel', function() {
    it('should gettype sublevel urls', function() {
        let res = cup.gettype("//sub.domain.com/aaa/bbb/","//sub.domain.com/aaa/bbb/ccc");
        assert.equal(res,"uplevel");
    });

    it('should gettype uplevel urls', function() {
        let res = cup.gettype("//sub.domain.com/aaa/bbb/ccc/ddd","//sub.domain.com/aaa/bbb/ccc");
        assert.equal(res,"sublevel");
    });

    it('should gettype samelevel urls', function() {
        let res = cup.gettype("//sub.domain.com/aaa/bbb/eee","//sub.domain.com/aaa/bbb/ccc");
        assert.equal(res,"samelevel");;
    });

    it('should handle invalid urls', function() {
        let res = cup.gettype("//sub.domain.com/aaa/bbb/eee","//sub.anotherdomain.com/aaa/bbb/ccc");
        assert.equal(res,"external");
    });
});


describe('gettype url without protocol as samelevel, sublevel, uplevel', function() {
    it('should gettype sublevel urls', function() {
        let res = cup.gettype("sub.domain.com/aaa/bbb/","sub.domain.com/aaa/bbb/ccc");
        assert.equal(res,"uplevel");
    });

    it('should gettype uplevel urls', function() {
        let res = cup.gettype("sub.domain.com/aaa/bbb/ccc/ddd","sub.domain.com/aaa/bbb/ccc");
        assert.equal(res,"sublevel");
    });

    it('should gettype samelevel urls', function() {
        let res = cup.gettype("sub.domain.com/aaa/bbb/eee","sub.domain.com/aaa/bbb/ccc");
        assert.equal(res,"samelevel");;
    });

    it('should handle invalid urls', function() {
        let res = cup.gettype("sub.domain.com/aaa/bbb/eee","sub.anotherdomain.com/aaa/bbb/ccc");
        assert.equal(res,"external");
    });
});
