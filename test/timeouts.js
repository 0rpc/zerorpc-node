// Open Source Initiative OSI - The MIT License (MIT):Licensing
//
// The MIT License (MIT)
// Copyright (c) 2015 François-Xavier Bourlet (bombela+zerorpc@gmail.com)
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the "Software"),
// to deal in the Software without restriction, including without limitation
// the rights to use, copy, modify, merge, publish, distribute, sublicense,
// and/or sell copies of the Software, and to permit persons to whom the
// Software is furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
// DEALINGS IN THE SOFTWARE.

var zerorpc = require(".."),
    tutil = require("./lib/testutil");

module.exports = {
	setUp: function(cb) {
		var endpoint = tutil.random_ipc_endpoint();
		this.srv = new zerorpc.Server({
			quiet: function(reply) {
				setTimeout(function() {
					try {
						reply(null, "Should not happen", false);
					} catch (e) { /* expected */ }
				}, 6 * 1000);
			}
		});
		this.srv.bind(endpoint);
		this.cli = new zerorpc.Client({ timeout: 5 });
		this.cli.connect(endpoint);
		cb();
	},
	tearDown: function(cb) {
		this.cli.close();
		this.srv.close();
		cb();
	},
	testQuiet: function(test) {
		test.expect(3);

		this.cli.invoke("quiet", function(error, res, more) {
			test.equal(error.name, "TimeoutExpired");
			test.equal(res, null);
			test.equal(more, false);
			test.done();
		});
	},
	testOverride: function(test) {
		var timeout = 1,
			start;
		test.expect(4);

		start = Date.now();
		this.cli.invoke({ timeout: timeout }, "quiet", function(error, res, more) {
			var end = Date.now();
			test.ok(end - start - 1000 < 30, "Timeout should be ~1 second");
			test.equal(error.name, "TimeoutExpired");
			test.equal(res, null);
			test.equal(more, false);
			test.done();
		});
    }
};
