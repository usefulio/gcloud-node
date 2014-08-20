/**
 * Copyright 2014 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @module datastore/dataset
 */

'use strict';

/** @type module:common/connection */
var conn = require('../common/connection.js');

/** @type module:datastore/entity */
var entity = require('./entity.js');

/** @type module:datastore/pb */
var pb = require('./pb.js');

/** @type module:datastore/query */
var Query = require('./query.js');

/** @type module:datastore/transaction */
var Transaction = require('./transaction.js');

/** @type module:common/util */
var util = require('../common/util.js');

/**
 * Scopes for Google Datastore access.
 * @const {array} SCOPES
 */
var SCOPES = [
  'https://www.googleapis.com/auth/datastore',
  'https://www.googleapis.com/auth/userinfo.email'
];

/**
 * Intract with a dataset from the
 * [Google Cloud Datastore]{@link https://developers.google.com/datastore/}.
 *
 * @constructor
 * @alias module:datastore/dataset
 *
 * @param {object} options
 * @param {string} options.id - Dataset ID. This is your project ID from the
 *     Google Developers Console.
 * @param {string} options.keyFileName - Full path to the JSON key downloaded
 *     from the Google Developers Console.
 *
 * @example
 * ```js
 * var dataset = new Dataset({
 *   id: 'my-project',
 *   keyFileName: '/path/to/keyfile.json'
 * });
 * ```
 */
function Dataset(opts) {
  opts = opts || {};
  var id = opts.projectId;

  this.connection = new conn.Connection({
    credentials: opts.credentials,
    keyFilename: opts.keyFilename,
    scopes: SCOPES
  });
  this.id = id;
  this.transaction = this.createTransaction_();
}

/**
 * Create a query from the current dataset to query the specified kinds.
 *
 * @borrows {module:datastore/query} as createQuery
 *
 * @example
 * ```js
 * var query = dataset.createQuery(['Lion', 'Chimp']);
 * var zooQuery = dataset.createQuery('zoo', ['Lion', 'Chimp']);
 * ```
 * @return {module:datastore/query}
 */
Dataset.prototype.createQuery = function(ns, kinds) {
  if (!kinds) {
    kinds = ns;
    ns = '';
  }
  kinds = util.arrayize(kinds);
  return new Query(ns, kinds);
};

/**
 * @borrows {module:datastore/transaction#get} as get
 *
 * @example
 * ```js
 * dataset.get([
 *   datastore.key('Company', 123),
 *   datastore.key('Product', 'Computer')
 * ], function(err, entities) {});
 * ```
 */
Dataset.prototype.get = function(key, callback) {
  this.transaction.get(key, callback);
};

/**
 * @borrows {module:datastore/transaction#save} as save
 *
 * @example
 * ```js
 * // Save a single entity.
 * dataset.save({
 *   key: datastore.key('Company', null),
 *   data: {
 *     rating: '10'
 *   }
 * }, function(err, key) {
 *   // Because we gave an incomplete key as an argument, `key` will be
 *   // populated with the complete, generated key.
 * });
 *
 * // Save multiple entities at once.
 * dataset.save([
 *   {
 *     key: datastore.key('Company', 123),
 *     data: {
 *       HQ: 'Dallas, TX'
 *     }
 *   },
 *   {
 *     key: datastore.key('Product', 'Computer'),
 *     data: {
 *       vendor: 'Dell'
 *     }
 *   }
 * ], function(err, keys) {});
 * ```
 */
Dataset.prototype.save = function(key, obj, callback) {
  this.transaction.save(key, obj, callback);
};

/**
 * @borrows {module:datastore/transaction#delete} as delete
 *
 * @example
 * ```js
 * // Delete a single entity.
 * dataset.delete(datastore.key('Company', 123), function(err) {});
 *
 * // Delete multiple entities at once.
 * dataset.delete([
 *   datastore.key('Company', 123),
 *   datastore.key('Product', 'Computer')
 * ], function(err) {});
 * ```
 */
Dataset.prototype.delete = function(key, callback) {
  this.transaction.delete(key, callback);
};

/**
 * @borrows {module:datastore/transaction#runQuery} as runQuery
 *
 * @example
 * ```js
 * // Retrieve 5 companies.
 * dataset.runQuery(queryObject, function(err, entities, nextQuery) {
 *   // `nextQuery` is not null if there are more results.
 *   if (nextQuery) {
 *     dataset.runQuery(nextQuery, function(err, entities, nextQuery) {});
 *   }
 * });
 * ```
 */
Dataset.prototype.runQuery = function(q, callback) {
  this.transaction.runQuery(q, callback);
};

/**
 * Run a function in the context of a new transaction. Transactions allow you to
 * perform multiple operations, committing your changes atomically.
 *
 * @borrows {module:datastore/transaction#begin} as runInTransaction
 *
 * @param {function} fn - The function to run in the context of a transaction.
 * @param {function} callback - The callback function.
 *
 * @example
 * ```js
 * dataset.transaction(function(transaction, done) {
 *   // From the `transaction` object, execute dataset methods as usual.
 *   // Call `done` when you're ready to commit all of the changes.
 *   transaction.get(datastore.key('Company', 123), function(err, entity) {
 *     if (err) {
 *       transaction.rollback(done);
 *       return;
 *     }
 *
 *     done();
 *   });
 * }, function(err) {});
 * ```
 */
Dataset.prototype.runInTransaction = function(fn, callback) {
  var newTransaction = this.createTransaction_();
  newTransaction.begin(function(err) {
    if (err) {
      return callback(err);
    }
    fn(newTransaction, newTransaction.finalize.bind(newTransaction, callback));
  });
};

/**
 * Generate IDs without creating entities.
 *
 * @param {Key} incompleteKey - The key object to complete.
 * @param {number} n - How many IDs to generate.
 * @param {function} callback - The callback function.
 *
 * @example
 * ```js
 * // The following call will create 100 new IDs from the Company kind, which
 * // exists under the default namespace.
 * var incompleteKey = datastore.key('Company', null);
 * dataset.allocateIds(incompleteKey, 100, function(err, keys) {});
 *
 * // You may prefer to create IDs from a non-default namespace by providing an
 * // incomplete key with a namespace. Similar to the previous example, the call
 * // below will create 100 new IDs, but from the Company kind that exists under
 * // the "ns-test" namespace.
 * var incompleteKey = datastore.key('ns-test', 'Company', null);
 * dataset.allocateIds(incompleteKey, 100, function(err, keys) {});
 * ```
 */
Dataset.prototype.allocateIds = function(incompleteKey, n, callback) {
  if (entity.isKeyComplete(incompleteKey)) {
    throw new Error('An incomplete key should be provided.');
  }
  var incompleteKeys = [];
  for (var i = 0; i < n; i++) {
    incompleteKeys.push(entity.keyToKeyProto(incompleteKey));
  }
  this.transaction.makeReq(
      'allocateIds',
      new pb.AllocateIdsRequest({ key: incompleteKeys }),
      pb.AllocateIdsResponse, function(err, resp) {
    if (err) {
      return callback(err);
    }
    var keys = [];
    (resp.key || []).forEach(function(k) {
      keys.push(entity.keyFromKeyProto(k));
    });
    callback(null ,keys);
  });
};

/**
 * Create a new Transaction object using the existing connection and dataset.
 *
 * @private
 * @return {module:datastore/transaction}
 */
Dataset.prototype.createTransaction_ = function() {
  return new Transaction(this.connection, this.id);
};

/**
 * Exports Dataset.
 * @type {Dataset}
 */
module.exports = Dataset;
