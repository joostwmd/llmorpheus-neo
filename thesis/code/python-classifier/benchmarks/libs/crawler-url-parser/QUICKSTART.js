//const cup = require('crawler-url-parser');
const cup = require('./');

//// parse(current_url,base_url)
let url = cup.parse("../ddd","http://question.stackoverflow.com/aaa/bbb/ccc/");
console.log(url.normalized);//http://question.stackoverflow.com/aaa/bbb/ddd
console.log(url.host); // question.stackoverflow.com
console.log(url.domain); // stackoverflow.com
console.log(url.subdomain); // question
console.log(url.protocol); // http:
console.log(url.path); // /aaa/bbb/ddd

//// extract(html_str,current_url);
let htmlStr=
    'html> \
        <body> \
            <a href="http://www.stackoverflow.com/internal-1">test-link-4</a><br /> \
            <a href="http://www.stackoverflow.com/internal-2">test-link-5</a><br /> \
            <a href="http://www.stackoverflow.com/internal-2">test-link-6</a><br /> \
            <a href="http://faq.stackoverflow.com/subdomain-1">test-link-7</a><br /> \
            <a href="http://faq.stackoverflow.com/subdomain-2">test-link-8</a><br /> \
            <a href="http://faq.stackoverflow.com/subdomain-2">test-link-9</a><br /> \
            <a href="http://www.google.com/external-1">test-link-10</a><br /> \
            <a href="http://www.google.com/external-2">test-link-11</a><br /> \
            <a href="http://www.google.com/external-2">test-link-12</a><br /> \
        </body> \
    </html>';
let currentUrl= "http://www.stackoverflow.com/aaa/bbb/ccc";
let urls = cup.extract(htmlStr,currentUrl);
console.log(urls.length); // 6

//// getlevel(current_url,base_url);
let level = cup.getlevel("sub.domain.com/aaa/bbb/","sub.domain.com/aaa/bbb/ccc");
console.log(level); //sublevel

level = cup.getlevel("sub.domain.com/aaa/bbb/ccc/ddd","sub.domain.com/aaa/bbb/ccc");
console.log(level); //uplevel

level = cup.getlevel("sub.domain.com/aaa/bbb/eee","sub.domain.com/aaa/bbb/ccc");
console.log(level); //samelevel

level = cup.getlevel("sub.domain.com/aaa/bbb/eee","sub.anotherdomain.com/aaa/bbb/ccc");
console.log(level); //null

//// querycount(url)
let count = cup.querycount("sub.domain.com/aaa/bbb?q1=data1&q2=data2&q3=data3");
console.log(count); //3
