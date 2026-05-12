const assert = require('assert');
const cup = require("../");

describe('07 readme parse test', function() {

    it('should pass 07 readme parse test 01', function() {
        let result = cup.parse("http://question.stackoverflow.com/aaa/bbb/ddd?q1=query1&q2=query2");
        assert.equal(result.baseurl,null);
        assert.equal(result.domain,"stackoverflow.com");
        assert.equal(result.host,"question.stackoverflow.com");
        assert.equal(result.path,"/aaa/bbb/ddd");
        assert.equal(result.protocol,"http:");
        assert.equal(result.querycount,2);
        assert.equal(result.search,"?q1=query1&q2=query2");
        assert.equal(result.subdomain,"question");
        assert.equal(result.url,"http://question.stackoverflow.com/aaa/bbb/ddd?q1=query1&q2=query2");
    });

    it('should pass 07 readme parse test 02', function() {
        let result = cup.parse("http://www.question.stackoverflow.com/aaa/bbb/ddd?q1=query1&q2=query2");
        assert.equal(result.baseurl,null);
        assert.equal(result.domain,"stackoverflow.com");
        assert.equal(result.host,"www.question.stackoverflow.com");
        assert.equal(result.path,"/aaa/bbb/ddd");
        assert.equal(result.protocol,"http:");
        assert.equal(result.querycount,2);
        assert.equal(result.search,"?q1=query1&q2=query2");
        assert.equal(result.subdomain,"www.question");
        assert.equal(result.url,"http://www.question.stackoverflow.com/aaa/bbb/ddd?q1=query1&q2=query2");
    });

    it('should pass 07 readme parse test 03', function() {
        let result = cup.parse("http://www.question.stackoverflow.com/aaa/bbb/ddd?q1=query1&q2=query2/");
        assert.equal(result.baseurl,null);
        assert.equal(result.domain,"stackoverflow.com");
        assert.equal(result.host,"www.question.stackoverflow.com");
        assert.equal(result.path,"/aaa/bbb/ddd");
        assert.equal(result.protocol,"http:");
        assert.equal(result.querycount,2);
        assert.equal(result.search,"?q1=query1&q2=query2/");
        assert.equal(result.subdomain,"www.question");
        assert.equal(result.url,"http://www.question.stackoverflow.com/aaa/bbb/ddd?q1=query1&q2=query2/");
    });

    it('should pass 07 readme parse test 04', function() {
        let result = cup.parse("https://www.question.stackoverflow.com/aaa/bbb/ddd?q1=query1&q2=query2/");
        assert.equal(result.baseurl,null);
        assert.equal(result.domain,"stackoverflow.com");
        assert.equal(result.host,"www.question.stackoverflow.com");
        assert.equal(result.path,"/aaa/bbb/ddd");
        assert.equal(result.protocol,"https:");
        assert.equal(result.querycount,2);
        assert.equal(result.search,"?q1=query1&q2=query2/");
        assert.equal(result.subdomain,"www.question");
        assert.equal(result.url,"https://www.question.stackoverflow.com/aaa/bbb/ddd?q1=query1&q2=query2/");
    });
});


describe('07 readme parse with baseURL test', function() {
    
        it('should pass 07 readme parse with baseURL test 01', function() {
            let result = cup.parse("../ddd?q1=query1&q2=query2","http://question.stackoverflow.com/aaa/bbb/ccc/");
            assert.equal(result.baseurl,"http://question.stackoverflow.com/aaa/bbb/ccc/");
            assert.equal(result.domain,"stackoverflow.com");
            assert.equal(result.host,"question.stackoverflow.com");
            assert.equal(result.path,"/aaa/bbb/ddd");
            assert.equal(result.protocol,"http:");
            assert.equal(result.querycount,2);
            assert.equal(result.search,"?q1=query1&q2=query2");
            assert.equal(result.subdomain,"question");
            assert.equal(result.url,"http://question.stackoverflow.com/aaa/bbb/ddd?q1=query1&q2=query2");
        });

        it('should pass 07 readme parse with baseURL test 01', function() {
            let result = cup.parse("../ddd?q1=query1&q2=query2","http://www.question.stackoverflow.com/aaa/bbb/ccc/");
            assert.equal(result.baseurl,"http://www.question.stackoverflow.com/aaa/bbb/ccc/");
            assert.equal(result.domain,"stackoverflow.com");
            assert.equal(result.host,"www.question.stackoverflow.com");
            assert.equal(result.path,"/aaa/bbb/ddd");
            assert.equal(result.protocol,"http:");
            assert.equal(result.querycount,2);
            assert.equal(result.search,"?q1=query1&q2=query2");
            assert.equal(result.subdomain,"www.question");
            assert.equal(result.url,"http://www.question.stackoverflow.com/aaa/bbb/ddd?q1=query1&q2=query2");
        });

        it('should pass 07 readme parse with baseURL test 01', function() {
            let result = cup.parse("../ddd?q1=query1&q2=query2","http://www.stackoverflow.com/aaa/bbb/ccc/");
            assert.equal(result.baseurl,"http://www.stackoverflow.com/aaa/bbb/ccc/");
            assert.equal(result.domain,"stackoverflow.com");
            assert.equal(result.host,"www.stackoverflow.com");
            assert.equal(result.path,"/aaa/bbb/ddd");
            assert.equal(result.protocol,"http:");
            assert.equal(result.querycount,2);
            assert.equal(result.search,"?q1=query1&q2=query2");
            assert.equal(result.subdomain,"www");
            assert.equal(result.url,"http://www.stackoverflow.com/aaa/bbb/ddd?q1=query1&q2=query2");
        });

        it('should pass 07 readme parse with baseURL test 01', function() {
            let result = cup.parse("../ddd?q1=query1&q2=query2","http://www.stackoverflow.com/aaa/bbb/ccc");
            assert.equal(result.baseurl,"http://www.stackoverflow.com/aaa/bbb/ccc");
            assert.equal(result.domain,"stackoverflow.com");
            assert.equal(result.host,"www.stackoverflow.com");
            assert.equal(result.path,"/aaa/ddd");
            assert.equal(result.protocol,"http:");
            assert.equal(result.querycount,2);
            assert.equal(result.search,"?q1=query1&q2=query2");
            assert.equal(result.subdomain,"www");
            assert.equal(result.url,"http://www.stackoverflow.com/aaa/ddd?q1=query1&q2=query2");
        });
    
    });