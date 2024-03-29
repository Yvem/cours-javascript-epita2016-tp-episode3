/* */ 
"format cjs";
/**
 * Module dependencies.
 */

var JSONCov = require('./json-cov');
var readFileSync = require('@node/fs').readFileSync;
var join = require('@node/path').join;

/**
 * Expose `HTMLCov`.
 */

exports = module.exports = HTMLCov;

/**
 * Initialize a new `JsCoverage` reporter.
 *
 * @api public
 * @param {Runner} runner
 */
function HTMLCov(runner) {
  var jade = require('@empty');
  var file = join(__dirname, '/templates/coverage.jade');
  var str = readFileSync(file, 'utf8');
  var fn = jade.compile(str, { filename: file });
  var self = this;

  JSONCov.call(this, runner, false);

  runner.on('end', function() {
    process.stdout.write(fn({
      cov: self.cov,
      coverageClass: coverageClass
    }));
  });
}

/**
 * Return coverage class for a given coverage percentage.
 *
 * @api private
 * @param {number} coveragePctg
 * @return {string}
 */
function coverageClass(coveragePctg) {
  if (coveragePctg >= 75) {
    return 'high';
  }
  if (coveragePctg >= 50) {
    return 'medium';
  }
  if (coveragePctg >= 25) {
    return 'low';
  }
  return 'terrible';
}
