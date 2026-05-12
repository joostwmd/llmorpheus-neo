# crawler-url-parser

**An URL parser for crawling purpose**

[![version](https://img.shields.io/npm/v/crawler-url-parser.svg)](https://www.npmjs.org/package/crawler-url-parser)
[![downloads](https://img.shields.io/npm/dt/crawler-url-parser.svg)](https://www.npmjs.org/package/crawler-url-parser)
[![node](https://img.shields.io/node/v/crawler-url-parser.svg)](https://nodejs.org/)
[![status](https://gitlab.com/autokent/crawler-url-parser/badges/master/pipeline.svg)](https://gitlab.com/autokent/crawler-url-parser/pipelines)

## Installation
`npm install crawler-url-parser`

## Usage

### Parse
```js
const cup = require('crawler-url-parser');

//// parse(current_url[,base_url])
let result = cup.parse("http://question.stackoverflow.com/aaa/bbb/ddd?q1=query1&q2=query2");

console.log(result.url);
// http://question.stackoverflow.com/aaa/bbb/ddd?q1=query1&q2=query2

console.log(result.baseurl);
// null

console.log(result.normalized);
// http://question.stackoverflow.com/aaa/bbb/ddd?q1=query1&q2=query2

console.log(result.host); 
// question.stackoverflow.com

console.log(result.domain); 
// stackoverflow.com

console.log(result.subdomain); 
// question

console.log(result.protocol); 
// http:

console.log(result.path); 
// /aaa/bbb/ddd

console.log(result.search); 
// q1=query1&q2=query2

console.log(result.querycount); 
// 2
```

### Parse with baseURL
```js
const cup = require('crawler-url-parser');

//// parse(current_url[,base_url])
let result = cup.parse("../ddd?q1=query1&q2=query2","http://question.stackoverflow.com/aaa/bbb/ccc/");

console.log(result.url);
// http://question.stackoverflow.com/aaa/bbb/ddd?q1=query1&q2=query2

console.log(result.baseurl);
// http://question.stackoverflow.com/aaa/bbb/ccc

console.log(result.normalized);
// http://question.stackoverflow.com/aaa/bbb/ddd?q1=query1&q2=query2

console.log(result.host); 
// question.stackoverflow.com

console.log(result.domain); 
// stackoverflow.com

console.log(result.subdomain); 
// question

console.log(result.protocol); 
// http:

console.log(result.path); 
// /aaa/bbb/ddd

console.log(result.search); 
// q1=query1&q2=query2

console.log(result.querycount); 
// 2
```

### Extract
```js
const cup = require('crawler-url-parser');

//// extract(html_str,current_url);
let htmlStr='<html><body> \
    <a href="http://best.question.stackoverflow.com">subdomain</a><br /> \
    <a href="http://faq.stackoverflow.com">subdomain</a><br /> \
    <a href="http://stackoverflow.com">updomain</a><br /> \
    <a href="http://www.google.com">external</a><br /> \
    <a href="http://www.facebook.com">external</a><br /> \
    <a href="http://question.stackoverflow.com/aaa/bbb/ccc">sublevel</a><br /> \
    <a href="http://question.stackoverflow.com/aaa/bbb/zzz">sublevel</a><br /> \
    <a href="http://question.stackoverflow.com/aaa/">uplevel</a><br /> \
    <a href="http://question.stackoverflow.com/aaa/ddd">samelevel</a><br /> \
    <a href="http://question.stackoverflow.com/aaa/eee">samelevel</a><br /> \
    <a href="http://question.stackoverflow.com/aaa/ddd/eee">internal</a><br /> \
    <a href="http://question.stackoverflow.com/zzz">internal</a><br /> \
</body></html>';

let currentUrl= "http://question.stackoverflow.com/aaa/bbb";
let urls = cup.extract(htmlStr,currentUrl);

console.log(urls[0].type); //subdomain
console.log(urls[1].type); //subdomain
console.log(urls[2].type); //updomain
console.log(urls[3].type); //external
console.log(urls[4].type); //external
console.log(urls[5].type); //sublevel
console.log(urls[6].type); //sublevel
console.log(urls[7].type); //uplevel
console.log(urls[8].type); //samelevel
console.log(urls[9].type); //samelevel
console.log(urls[10].type); //internal
console.log(urls[11].type); //subdomain

```

### Level
```js
const cup = require('crawler-url-parser');

//// gettype(current_url,base_url);
let level = cup.gettype("sub.domain.com/aaa/bbb/","sub.domain.com/aaa/bbb/ccc");
console.log(level); //sublevel

level = cup.gettype("sub.domain.com/aaa/bbb/ccc/ddd","sub.domain.com/aaa/bbb/ccc");
console.log(level); //uplevel

level = cup.gettype("sub.domain.com/aaa/bbb/eee","sub.domain.com/aaa/bbb/ccc");
console.log(level); //samelevel

level = cup.gettype("sub.domain.com/aaa/bbb/eee","sub.anotherdomain.com/aaa/bbb/ccc");
console.log(level); //external
```

## Test

* `mocha` or `npm test`
* More than 200 unit test cases.
* Check [test folder](https://gitlab.com/autokent/crawler-url-parser/tree/master/test) and [quickstart.js](https://gitlab.com/autokent/crawler-url-parser/blob/master/quickstart.js) for extra usages.


## Support
I use this package actively myself, so it has my top priority. You can chat on WhatsApp about any infos, ideas and suggestions.

[![WhatsApp](https://img.shields.io/badge/style-chat-green.svg?style=flat&label=whatsapp)](https://api.whatsapp.com/send?phone=905063042480&text=Hi%2C%0ALet%27s%20talk%20about%20crawler-url-parser)

### Submitting an Issue
If you find a bug or a mistake, you can help by submitting an issue to [GitLab Repository](https://gitlab.com/autokent/crawler-url-parser/issues)

### Creating a Merge Request
GitLab calls it merge request instead of pull request.  

* [A Guide for First-Timers](https://about.gitlab.com/2016/06/16/fearless-contribution-a-guide-for-first-timers/)
* [How to create a merge request](https://docs.gitlab.com/ee/gitlab-basics/add-merge-request.html)
* Check [Contributing Guide](https://gitlab.com/autokent/crawler-url-parser/blob/master/CONTRIBUTING.md) 

## License
[MIT licensed](https://gitlab.com/autokent/crawler-url-parser/blob/master/LICENSE) and all it's dependencies are MIT or BSD licensed.