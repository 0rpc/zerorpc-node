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
	_ = require("underscore");
	tutil = require("./lib/testutil");

module.exports = {
	setUp: function(cb) {
		var endpoint = tutil.random_ipc_endpoint();
		this.srv = new zerorpc.Server({
			addMan: function(sentence, reply) {
				reply(null, sentence + ", man!", false);
			},

			add42: function(n, reply) {
				reply(null, n + 42, false);
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
	testNormalStringMethod: function(test) {
		test.expect(3);

		this.cli.invoke("addMan", "This is not an error",
				function(error, res, more) {
					test.ifError(error);
					test.deepEqual(res, "This is not an error, man!");
					test.equal(more, false);
					test.done();
				});
	},
	testNormalIntMethod: function(test) {
		test.expect(3);

		this.cli.invoke("add42", 30, function(error, res, more) {
			test.ifError(error);
			test.deepEqual(res, 72);
			test.equal(more, false);
			test.done();
		});
	},
	testIntrospector: function(test) {
		test.expect(8);

		this.cli.invoke("_zerorpc_inspect", function(error, res, more) {
			test.ifError(error);

			test.equal(typeof(res.name), "string");
			test.equal(_.keys(res.methods).length, 2);

			for(var key in res.methods) {
				test.equal(res.methods[key].doc, "");
			}

			test.deepEqual(res.methods.add42.args.length, 1);
			test.deepEqual(res.methods.add42.args[0].name, "n");
			test.equal(more, false);
			test.done();
		});
	},
	testNonExistentMethod: function(test) {
		test.expect(3);

		this.cli.invoke("non_existent", function(error, res, more) {
			test.ok(error);
			test.equal(res, null);
			test.equal(more, false);
			test.done();
		});
	},
	testBadClient: function(test) {
		test.expect(3);

		var badRpcClient = new zerorpc.Client({ timeout: 5 });
		badRpcClient.connect(tutil.random_ipc_endpoint());

		badRpcClient.invoke("add42", 30, function(error, res, more) {
			test.ok(error);
			test.equal(res, null);
			test.equal(more, false);
			badRpcClient.close();
			test.done();
		});
	}
};
