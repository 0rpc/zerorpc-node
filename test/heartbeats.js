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
		var self = this;
		var heartbeat = 1000;
		var endpoint = tutil.random_ipc_endpoint();
		this.srv = new zerorpc.Server({
			lazyErrorableIter: function(reply) {
				var counter = 0;

				var interval = setInterval(function() {
					try {
						reply(null, counter, true);
					} catch(e) {
						self.killed = true;
						clearTimeout(interval);
					}

					counter++;
				}, 250);
			}
		}, heartbeat);
		this.srv.bind(endpoint);
		this.srv.on('error', function(err) {
			//console.log('on error', err);
		});
		this.cli = new zerorpc.Client({ timeout: 11000, heartbeat: heartbeat });
		this.cli.connect(endpoint);
		this.killed = false;
		cb();
	},
	tearDown: function(cb) {
		if (!this.cli.closed()) {
			this.cli.close();
		}
		this.srv.close();
		cb();
	},
	testClose: function(test) {
		var self = this;
		test.expect(1);

		var hit = false;
		this.cli.invoke("lazyErrorableIter", function(error, res, more) {
			if(hit) {
				test.ok(false,
	"lazyErrorableIter() should not have been called more than once");
				return;
			}
			hit = true;
			test.ifError(error);
			self.cli.close();

			////Repeatedly poll for a closed connection - if after 20 seconds
			////(2 heartbeats) the connection isn't closed, throw an error
			var numChecks = 0;
			var checkTimeout = setInterval(function() {
				if(self.killed) {
					clearTimeout(checkTimeout);
					test.done();
				} else if(numChecks++ == 20) {
					test.ok(false, "Connection not closed on the remote end");
				}
			}, 1000);
		});
	},
};
