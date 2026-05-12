# bare-semver

Minimal semantic versioning library for Bare.

```
npm i bare-semver
```

## Usage

```js
const semver = require('bare-semver')

const version = semver.Version.parse('1.2.3-alpha.1+build.42')

console.log(version.major) // 1
console.log(version.minor) // 2
console.log(version.patch) // 3

const satisfied = semver.satisfies('1.2.3', '>=1.0.0 <2.0.0')

console.log(satisfied) // true
```

## API

#### `const satisfied = semver.satisfies(version, range)`

Test whether `version` satisfies `range`. Both `version` and `range` may be strings, in which case they will be parsed.

#### `semver.constants`

An object containing the comparison operator constants:

```js
constants = {
  EQ: 1,
  LT: 2,
  LTE: 3,
  GT: 4,
  GTE: 5
}
```

#### `semver.errors`

The `SemVerError` class. Thrown when parsing invalid versions or ranges.

#### `const version = new semver.Version(major, minor, patch[, options])`

Create a new version with the given `major`, `minor`, and `patch` components.

Options include:

```js
options = {
  prerelease: [],
  build: []
}
```

#### `version.major`

The major version number.

#### `version.minor`

The minor version number.

#### `version.patch`

The patch version number.

#### `version.prerelease`

An array of prerelease tags.

#### `version.build`

An array of build metadata tags.

#### `const result = version.compare(other)`

Compare `version` with `other`, returning `1` if `version` is greater, `-1` if less, or `0` if equal. Comparison follows the Semantic Versioning 2.0.0 specification, including prerelease precedence rules.

#### `const string = version.toString()`

Return the string representation of `version`.

#### `const version = semver.Version.parse(input)`

Parse a semantic version string into a `Version` instance. Throws a `SemVerError` with code `INVALID_VERSION` if `input` is not a valid version string.

#### `const result = semver.Version.compare(a, b)`

Compare two `Version` instances, returning `1`, `-1`, or `0`.

#### `const comparator = new semver.Comparator(operator, version)`

Create a new comparator with the given `operator` constant and `version`.

#### `comparator.operator`

The comparison operator constant.

#### `comparator.version`

The `Version` instance to compare against.

#### `const satisfied = comparator.test(version)`

Test whether `version` satisfies the comparator.

#### `const string = comparator.toString()`

Return the string representation of the comparator, e.g. `>=1.0.0`.

#### `const range = new semver.Range([comparators])`

Create a new range from a two-dimensional array of `Comparator` instances. Each inner array represents a set of comparators joined by intersection, and the outer array represents the union of those sets.

#### `range.comparators`

The two-dimensional array of `Comparator` instances.

#### `const satisfied = range.test(version)`

Test whether `version` satisfies the range.

#### `const string = range.toString()`

Return the string representation of the range.

#### `const range = semver.Range.parse(input)`

Parse a range string into a `Range` instance. Supports comparison operators (`<`, `<=`, `>`, `>=`, `=`), partial versions, and logical OR (`||`).

## License

Apache-2.0
