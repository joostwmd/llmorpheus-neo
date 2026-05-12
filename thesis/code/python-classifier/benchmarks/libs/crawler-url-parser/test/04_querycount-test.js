const assert = require('assert');
const cup = require("../");

describe('querycount url', function() {
    it('should calculate urls query-0', function() {
        let res = cup.parse("sub.domain.com/aaa/bbb");
        assert.equal(res.querycount,0);
    });

    it('should calculate urls query-1', function() {
        let res = cup.parse("sub.domain.com/aaa/bbb?q1=data1");
        assert.equal(res.querycount,1);
    });

    it('should calculate urls query-2', function() {
        let res = cup.parse("sub.domain.com/aaa/bbb?q1=data1&q2=data2");
        assert.equal(res.querycount,2);
    });

    it('should calculate urls query-3', function() {
        let res = cup.parse("sub.domain.com/aaa/bbb?q1=data1&q2=data2&q3=data3");
        assert.equal(res.querycount,3);
    });

    it('should calculate urls query-4', function() {
        let res = cup.parse("sub.domain.com/aaa/bbb?q1=data1&q2=data2&q3=data3&q4=data4");
        assert.equal(res.querycount,4);
    });
});
