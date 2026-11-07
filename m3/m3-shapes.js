/*
 * m3-shapes.js: Material 3 Expressive shapes and shape morphing for the web.
 *
 * Generated from rounded-polygon-qmljs (https://github.com/end-4/rounded-polygon-qmljs,
 * commit e31ec4cb, as vendored by Swiftify): end-4's QML JavaScript port of
 * Knugel's TypeScript port of androidx graphics-shapes, with Material 3's 35
 * shapes. Licensed under the Apache License 2.0; see LICENSE-shapes.txt.
 *
 * Only the module wrapping, Swiftify's two shapes and the M3Shapes API at the
 * bottom are new. Those parts are:
 *   Copyright (C) 2026 shredos67, thefoxyydev and the Swiftify contributors
 *   Copyright (C) 2026 teofilcelzmecher
 * and, with the rest of this design system, licensed under the GNU General
 * Public License, version 3 or (at your option) any later version; see LICENSE.
 * The file as a whole is distributed under GPL-3.0-or-later, which the Apache
 * License 2.0 allows.
 */

(function (global) {
  'use strict';

  const __factories = {
  "geometry/offset.js": function (__require) {
    /**
     * @param {number} x
     * @param {number} y
     * @returns {Offset}
     */
    function createOffset(x, y) {
        return new Offset(x, y);
    }

    class Offset {
        /**
         * @param {number} x
         * @param {number} y
         */
        constructor(x, y) {
            this.x = x;
            this.y = y;
        }

        /**
         * @param {number} x
         * @param {number} y
         * @returns {Offset}
         */
        copy(x = this.x, y = this.y) {
            return new Offset(x, y);
        }

        /**
         * @returns {number}
         */
        getDistance() {
            return Math.sqrt(this.x * this.x + this.y * this.y);
        }

        /**
         * @returns {number}
         */
        getDistanceSquared() {
            return this.x * this.x + this.y * this.y;
        }

        /**
         * @returns {boolean}
         */
        isValid() {
            return isFinite(this.x) && isFinite(this.y);
        }

        /**
         * @returns {boolean}
         */
        get isFinite() {
            return isFinite(this.x) && isFinite(this.y);
        }

        /**
         * @returns {boolean}
         */
        get isSpecified() {
            return !this.isUnspecified;
        }

        /**
         * @returns {boolean}
         */
        get isUnspecified() {
            return Object.is(this.x, NaN) && Object.is(this.y, NaN);
        }

        /**
         * @returns {Offset}
         */
        negate() {
            return new Offset(-this.x, -this.y);
        }

        /**
         * @param {Offset} other
         * @returns {Offset}
         */
        minus(other) {
            return new Offset(this.x - other.x, this.y - other.y);
        }

        /**
         * @param {Offset} other
         * @returns {Offset}
         */
        plus(other) {
            return new Offset(this.x + other.x, this.y + other.y);
        }

        /**
         * @param {number} operand
         * @returns {Offset}
         */
        times(operand) {
            return new Offset(this.x * operand, this.y * operand);
        }

        /**
         * @param {number} operand
         * @returns {Offset}
         */
        div(operand) {
            return new Offset(this.x / operand, this.y / operand);
        }

        /**
         * @param {number} operand
         * @returns {Offset}
         */
        rem(operand) {
            return new Offset(this.x % operand, this.y % operand);
        }

        /**
         * @returns {string}
         */
        toString() {
            if (this.isSpecified) {
                return `Offset(${this.x.toFixed(1)}, ${this.y.toFixed(1)})`;
            } else {
                return 'Offset.Unspecified';
            }
        }

        /**
         * @param {Offset} start
         * @param {Offset} stop
         * @param {number} fraction
         * @returns {Offset}
         */
        static lerp(start, stop, fraction) {
            return new Offset(
                start.x + (stop.x - start.x) * fraction,
                start.y + (stop.y - start.y) * fraction
            );
        }

        /**
         * @param {function(): Offset} block
         * @returns {Offset}
         */
        takeOrElse(block) {
            return this.isSpecified ? this : block();
        }

        /**
         * @returns {number}
         */
        angleDegrees() {
            return Math.atan2(this.y, this.x) * 180 / Math.PI;
        }

        /**
         * @param {number} angle
         * @param {Offset} center
         * @returns {Offset}
         */
        rotateDegrees(angle, center = Offset.Zero) {
            const a = angle * Math.PI / 180;
            const off = this.minus(center);
            const cosA = Math.cos(a);
            const sinA = Math.sin(a);
            const newX = off.x * cosA - off.y * sinA;
            const newY = off.x * sinA + off.y * cosA;
            return new Offset(newX, newY).plus(center);
        }
    }

    Offset.Zero = new Offset(0, 0);
    Offset.Infinite = new Offset(Infinity, Infinity);
    Offset.Unspecified = new Offset(NaN, NaN);
    return { createOffset, Offset };
  },
  "graphics/matrix.js": function (__require) {
    const Offset = __require("geometry/offset.js");
    class Matrix {
        constructor(values = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) {
            this.values = values;
        }

        get(row, column) {
            return this.values[(row * 4) + column];
        }

        set(row, column, v) {
            this.values[(row * 4) + column] = v;
        }

        /** Does the 3D transform on [point] and returns the `x` and `y` values in an [Offset]. */
        map(point) {
            if (this.values.length < 16) return point;

            const v00 = this.get(0, 0);
            const v01 = this.get(0, 1);
            const v03 = this.get(0, 3);
            const v10 = this.get(1, 0);
            const v11 = this.get(1, 1);
            const v13 = this.get(1, 3);
            const v30 = this.get(3, 0);
            const v31 = this.get(3, 1);
            const v33 = this.get(3, 3);

            const x = point.x;
            const y = point.y;
            const z = v03 * x + v13 * y + v33;
            const inverseZ = 1 / z;
            const pZ = isFinite(inverseZ) ? inverseZ : 0;

            return new Offset.Offset(pZ * (v00 * x + v10 * y + v30), pZ * (v01 * x + v11 * y + v31));
        }

        /** Multiply this matrix by [m] and assign the result to this matrix. */
        timesAssign(m) {
            const v = this.values;
            if (v.length < 16) return;
            if (m.values.length < 16) return;

            const v00 = this.dot(0, m, 0);
            const v01 = this.dot(0, m, 1);
            const v02 = this.dot(0, m, 2);
            const v03 = this.dot(0, m, 3);
            const v10 = this.dot(1, m, 0);
            const v11 = this.dot(1, m, 1);
            const v12 = this.dot(1, m, 2);
            const v13 = this.dot(1, m, 3);
            const v20 = this.dot(2, m, 0);
            const v21 = this.dot(2, m, 1);
            const v22 = this.dot(2, m, 2);
            const v23 = this.dot(2, m, 3);
            const v30 = this.dot(3, m, 0);
            const v31 = this.dot(3, m, 1);
            const v32 = this.dot(3, m, 2);
            const v33 = this.dot(3, m, 3);

            v[0] = v00;
            v[1] = v01;
            v[2] = v02;
            v[3] = v03;
            v[4] = v10;
            v[5] = v11;
            v[6] = v12;
            v[7] = v13;
            v[8] = v20;
            v[9] = v21;
            v[10] = v22;
            v[11] = v23;
            v[12] = v30;
            v[13] = v31;
            v[14] = v32;
            v[15] = v33;
        }

        dot(row, m, column) {
            return this.get(row, 0) * m.get(0, column) +
                this.get(row, 1) * m.get(1, column) +
                this.get(row, 2) * m.get(2, column) +
                this.get(row, 3) * m.get(3, column);
        }

        /** Resets the `this` to the identity matrix. */
        reset() {
            const v = this.values;
            if (v.length < 16) return;
            v[0] = 1;
            v[1] = 0;
            v[2] = 0;
            v[3] = 0;
            v[4] = 0;
            v[5] = 1;
            v[6] = 0;
            v[7] = 0;
            v[8] = 0;
            v[9] = 0;
            v[10] = 1;
            v[11] = 0;
            v[12] = 0;
            v[13] = 0;
            v[14] = 0;
            v[15] = 1;
        }

        /** Applies a [degrees] rotation around Z to `this`. */
        rotateZ(degrees) {
            if (this.values.length < 16) return;

            const r = degrees * (Math.PI / 180.0);
            const s = Math.sin(r);
            const c = Math.cos(r);

            const a00 = this.get(0, 0);
            const a10 = this.get(1, 0);
            const v00 = c * a00 + s * a10;
            const v10 = -s * a00 + c * a10;

            const a01 = this.get(0, 1);
            const a11 = this.get(1, 1);
            const v01 = c * a01 + s * a11;
            const v11 = -s * a01 + c * a11;

            const a02 = this.get(0, 2);
            const a12 = this.get(1, 2);
            const v02 = c * a02 + s * a12;
            const v12 = -s * a02 + c * a12;

            const a03 = this.get(0, 3);
            const a13 = this.get(1, 3);
            const v03 = c * a03 + s * a13;
            const v13 = -s * a03 + c * a13;

            this.set(0, 0, v00);
            this.set(0, 1, v01);
            this.set(0, 2, v02);
            this.set(0, 3, v03);
            this.set(1, 0, v10);
            this.set(1, 1, v11);
            this.set(1, 2, v12);
            this.set(1, 3, v13);
        }

        /** Scale this matrix by [x], [y], [z] */
        scale(x = 1, y = 1, z = 1) {
            if (this.values.length < 16) return;
            this.set(0, 0, this.get(0, 0) * x);
            this.set(0, 1, this.get(0, 1) * x);
            this.set(0, 2, this.get(0, 2) * x);
            this.set(0, 3, this.get(0, 3) * x);
            this.set(1, 0, this.get(1, 0) * y);
            this.set(1, 1, this.get(1, 1) * y);
            this.set(1, 2, this.get(1, 2) * y);
            this.set(1, 3, this.get(1, 3) * y);
            this.set(2, 0, this.get(2, 0) * z);
            this.set(2, 1, this.get(2, 1) * z);
            this.set(2, 2, this.get(2, 2) * z);
            this.set(2, 3, this.get(2, 3) * z);
        }

        /** Translate this matrix by [x], [y], [z] */
        translate(x = 0, y = 0, z = 0) {
            if (this.values.length < 16) return;
            const t1 = this.get(0, 0) * x + this.get(1, 0) * y + this.get(2, 0) * z + this.get(3, 0);
            const t2 = this.get(0, 1) * x + this.get(1, 1) * y + this.get(2, 1) * z + this.get(3, 1);
            const t3 = this.get(0, 2) * x + this.get(1, 2) * y + this.get(2, 2) * z + this.get(3, 2);
            const t4 = this.get(0, 3) * x + this.get(1, 3) * y + this.get(2, 3) * z + this.get(3, 3);
            this.set(3, 0, t1);
            this.set(3, 1, t2);
            this.set(3, 2, t3);
            this.set(3, 3, t4);
        }

        toString() {
            return `${this.get(0, 0)} ${this.get(0, 1)} ${this.get(0, 2)} ${this.get(0, 3)}\n` +
                `${this.get(1, 0)} ${this.get(1, 1)} ${this.get(1, 2)} ${this.get(1, 3)}\n` +
                `${this.get(2, 0)} ${this.get(2, 1)} ${this.get(2, 2)} ${this.get(2, 3)}\n` +
                `${this.get(3, 0)} ${this.get(3, 1)} ${this.get(3, 2)} ${this.get(3, 3)}`;
        }
    }

    // Companion object constants
    Matrix.ScaleX = 0;
    Matrix.SkewY = 1;
    Matrix.Perspective0 = 3;
    Matrix.SkewX = 4;
    Matrix.ScaleY = 5;
    Matrix.Perspective1 = 7;
    Matrix.ScaleZ = 10;
    Matrix.TranslateX = 12;
    Matrix.TranslateY = 13;
    Matrix.TranslateZ = 14;
    Matrix.Perspective2 = 15;
    return { Matrix };
  },
  "material-shapes.js": function (__require) {
    const Point = __require("shapes/point.js");
    const RoundedPolygon = __require("shapes/rounded-polygon.js");
    const CornerRounding = __require("shapes/corner-rounding.js");
    const Offset = __require("geometry/offset.js");
    const Matrix = __require("graphics/matrix.js");
    var _circle = null
    var _square = null
    var _slanted = null
    var _arch = null
    var _fan = null
    var _arrow = null
    var _semiCircle = null
    var _oval = null
    var _pill = null
    var _triangle = null
    var _diamond = null
    var _clamShell = null
    var _pentagon = null
    var _gem = null
    var _verySunny = null
    var _sunny = null
    var _cookie4Sided = null
    var _cookie6Sided = null
    var _cookie7Sided = null
    var _cookie9Sided = null
    var _cookie12Sided = null
    var _ghostish = null
    var _clover4Leaf = null
    var _clover8Leaf = null
    var _burst = null
    var _softBurst = null
    var _boom = null
    var _softBoom = null
    var _flower = null
    var _puffy = null
    var _puffyDiamond = null
    var _pixelCircle = null
    var _pixelTriangle = null
    var _bun = null
    var _heart = null

    var cornerRound15 = new CornerRounding.CornerRounding(0.15)
    var cornerRound20 = new CornerRounding.CornerRounding(0.2)
    var cornerRound30 = new CornerRounding.CornerRounding(0.3)
    var cornerRound50 = new CornerRounding.CornerRounding(0.5)
    var cornerRound100 = new CornerRounding.CornerRounding(1.0)

    var rotateNeg30 = new Matrix.Matrix();
    rotateNeg30.rotateZ(-30);
    var rotateNeg45 = new Matrix.Matrix();
    rotateNeg45.rotateZ(-45);
    var rotateNeg90 = new Matrix.Matrix();
    rotateNeg90.rotateZ(-90);
    var rotateNeg135 = new Matrix.Matrix();
    rotateNeg135.rotateZ(-135);
    var rotate30 = new Matrix.Matrix();
    rotate30.rotateZ(30);
    var rotate45 = new Matrix.Matrix();
    rotate45.rotateZ(45);
    var rotate60 = new Matrix.Matrix();
    rotate60.rotateZ(60);
    var rotate90 = new Matrix.Matrix();
    rotate90.rotateZ(90);
    var rotate120 = new Matrix.Matrix();
    rotate120.rotateZ(120);
    var rotate135 = new Matrix.Matrix();
    rotate135.rotateZ(135);
    var rotate180 = new Matrix.Matrix();
    rotate180.rotateZ(180);

    var rotate28th = new Matrix.Matrix();
    rotate28th.rotateZ(360/28);
    var rotateNeg16th = new Matrix.Matrix();
    rotateNeg16th.rotateZ(-360/16);

    function getCircle() {
        if (_circle !== null) return _circle;
        _circle = circle();
        return _circle;
    }

    function getSquare() {
        if (_square !== null) return _square;
        _square = square();
        return _square;
    }

    function getSlanted() {
        if (_slanted !== null) return _slanted;
        _slanted = slanted();
        return _slanted;
    }

    function getArch() {
        if (_arch !== null) return _arch;
        _arch = arch();
        return _arch;
    }

    function getFan() {
        if (_fan !== null) return _fan;
        _fan = fan();
        return _fan;
    }

    function getArrow() {
        if (_arrow !== null) return _arrow;
        _arrow = arrow();
        return _arrow;
    }

    function getSemiCircle() {
        if (_semiCircle !== null) return _semiCircle;
        _semiCircle = semiCircle();
        return _semiCircle;
    }

    function getOval() {
        if (_oval !== null) return _oval;
        _oval = oval();
        return _oval;
    }

    function getPill() {
        if (_pill !== null) return _pill;
        _pill = pill();
        return _pill;
    }

    function getTriangle() {
        if (_triangle !== null) return _triangle;
        _triangle = triangle();
        return _triangle;
    }

    function getDiamond() {
        if (_diamond !== null) return _diamond;
        _diamond = diamond();
        return _diamond;
    }

    function getClamShell() {
        if (_clamShell !== null) return _clamShell;
        _clamShell = clamShell();
        return _clamShell;
    }

    function getPentagon() {
        if (_pentagon !== null) return _pentagon;
        _pentagon = pentagon();
        return _pentagon;
    }

    function getGem() {
        if (_gem !== null) return _gem;
        _gem = gem();
        return _gem;
    }

    function getSunny() {
        if (_sunny !== null) return _sunny;
        _sunny = sunny();
        return _sunny;
    }

    function getVerySunny() {
        if (_verySunny !== null) return _verySunny;
        _verySunny = verySunny();
        return _verySunny;
    }

    function getCookie4Sided() {
        if (_cookie4Sided !== null) return _cookie4Sided;
        _cookie4Sided = cookie4();
        return _cookie4Sided;
    }

    function getCookie6Sided() {
        if (_cookie6Sided !== null) return _cookie6Sided;
        _cookie6Sided = cookie6();
        return _cookie6Sided;
    }

    function getCookie7Sided() {
        if (_cookie7Sided !== null) return _cookie7Sided;
        _cookie7Sided = cookie7();
        return _cookie7Sided;
    }

    function getCookie9Sided() {
        if (_cookie9Sided !== null) return _cookie9Sided;
        _cookie9Sided = cookie9();
        return _cookie9Sided;
    }

    function getCookie12Sided() {
        if (_cookie12Sided !== null) return _cookie12Sided;
        _cookie12Sided = cookie12();
        return _cookie12Sided;
    }

    function getGhostish() {
        if (_ghostish !== null) return _ghostish;
        _ghostish = ghostish();
        return _ghostish;
    }

    function getClover4Leaf() {
        if (_clover4Leaf !== null) return _clover4Leaf;
        _clover4Leaf = clover4();
        return _clover4Leaf;
    }

    function getClover8Leaf() {
        if (_clover8Leaf !== null) return _clover8Leaf;
        _clover8Leaf = clover8();
        return _clover8Leaf;
    }

    function getBurst() {
        if (_burst !== null) return _burst;
        _burst = burst();
        return _burst;
    }

    function getSoftBurst() {
        if (_softBurst !== null) return _softBurst;
        _softBurst = softBurst();
        return _softBurst;
    }

    function getBoom() {
        if (_boom !== null) return _boom;
        _boom = boom();
        return _boom;
    }

    function getSoftBoom() {
        if (_softBoom !== null) return _softBoom;
        _softBoom = softBoom();
        return _softBoom;
    }

    function getFlower() {
        if (_flower !== null) return _flower;
        _flower = flower();
        return _flower;
    }

    function getPuffy() {
        if (_puffy !== null) return _puffy;
        _puffy = puffy();
        return _puffy;
    }

    function getPuffyDiamond() {
        if (_puffyDiamond !== null) return _puffyDiamond;
        _puffyDiamond = puffyDiamond();
        return _puffyDiamond;
    }

    function getPixelCircle() {
        if (_pixelCircle !== null) return _pixelCircle;
        _pixelCircle = pixelCircle();
        return _pixelCircle;
    }

    function getPixelTriangle() {
        if (_pixelTriangle !== null) return _pixelTriangle;
        _pixelTriangle = pixelTriangle();
        return _pixelTriangle;
    }

    function getBun() {
        if (_bun !== null) return _bun;
        _bun = bun();
        return _bun;
    }

    function getHeart() {
        if (_heart !== null) return _heart;
        _heart = heart();
        return _heart;
    }

    function circle() {
        return RoundedPolygon.RoundedPolygon.circle(10)
            .transformed((x, y) => rotate45.map(new Offset.Offset(x, y)))
            .normalized();
    }

    function square() {
        return RoundedPolygon.RoundedPolygon.rectangle(1, 1, cornerRound30).normalized();
    }

    function slanted() {
        return customPolygon([
            new PointNRound(new Offset.Offset(0.926, 0.970), new CornerRounding.CornerRounding(0.189, 0.811)),
            new PointNRound(new Offset.Offset(-0.021, 0.967), new CornerRounding.CornerRounding(0.187, 0.057)),
        ], 2).normalized();
    }

    function arch() {
        return RoundedPolygon.RoundedPolygon.rectangle(1, 1, CornerRounding.Unrounded, [cornerRound20, cornerRound20, cornerRound100, cornerRound100])
            .normalized();
    }

    function fan() {
        return customPolygon([
            new PointNRound(new Offset.Offset(1.004, 1.000), new CornerRounding.CornerRounding(0.148, 0.417)),
            new PointNRound(new Offset.Offset(0.000, 1.000), new CornerRounding.CornerRounding(0.151)),
            new PointNRound(new Offset.Offset(0.000, -0.003), new CornerRounding.CornerRounding(0.148)),
            new PointNRound(new Offset.Offset(0.978, 0.020), new CornerRounding.CornerRounding(0.803)),
        ], 1).normalized();
    }

    function arrow() {
        return customPolygon([
            new PointNRound(new Offset.Offset(1.225, 1.060), new CornerRounding.CornerRounding(0.211)),
            new PointNRound(new Offset.Offset(0.500, 0.892), new CornerRounding.CornerRounding(0.313)),
            new PointNRound(new Offset.Offset(-0.216, 1.050), new CornerRounding.CornerRounding(0.207)),
            new PointNRound(new Offset.Offset(0.499, -0.160), new CornerRounding.CornerRounding(0.215, 1.000)),
        ], 1).normalized();
    }

    function semiCircle() {
        return RoundedPolygon.RoundedPolygon.rectangle(1.6, 1, CornerRounding.Unrounded, [cornerRound20, cornerRound20, cornerRound100, cornerRound100]).normalized();
    }

    function oval() {
        const scaleMatrix = new Matrix.Matrix();
        scaleMatrix.scale(1, 0.64);
        return RoundedPolygon.RoundedPolygon.circle()
            .transformed((x, y) => rotateNeg90.map(new Offset.Offset(x, y)))
            .transformed((x, y) => scaleMatrix.map(new Offset.Offset(x, y)))
            .transformed((x, y) => rotate135.map(new Offset.Offset(x, y)))
            .normalized();
    }

    function pill() {
        return customPolygon([
            // new PointNRound(new Offset.Offset(0.609, 0.000), new CornerRounding.CornerRounding(1.000)),
            new PointNRound(new Offset.Offset(0.428, -0.001), new CornerRounding.CornerRounding(0.426)),
            new PointNRound(new Offset.Offset(0.961, 0.039), new CornerRounding.CornerRounding(0.426)),
            new PointNRound(new Offset.Offset(1.001, 0.428)),
            new PointNRound(new Offset.Offset(1.000, 0.609), new CornerRounding.CornerRounding(1.000)),
        ], 2)
            .transformed((x, y) => rotate180.map(new Offset.Offset(x, y)))
            .normalized();
    }

    function triangle() {
        return RoundedPolygon.RoundedPolygon.fromNumVertices(3, 1, 0.5, 0.5, cornerRound20)
            .transformed((x, y) => rotate30.map(new Offset.Offset(x, y)))
            .normalized()
    }

    function diamond() {
        return customPolygon([
            new PointNRound(new Offset.Offset(0.500, 1.096), new CornerRounding.CornerRounding(0.151, 0.524)),
            new PointNRound(new Offset.Offset(0.040, 0.500), new CornerRounding.CornerRounding(0.159)),
        ], 2).normalized();
    }

    function clamShell() {
        return customPolygon([
            new PointNRound(new Offset.Offset(0.829, 0.841), new CornerRounding.CornerRounding(0.159)),
            new PointNRound(new Offset.Offset(0.171, 0.841), new CornerRounding.CornerRounding(0.159)),
            new PointNRound(new Offset.Offset(-0.020, 0.500), new CornerRounding.CornerRounding(0.140)),
        ], 2).normalized();
    }

    function pentagon() {
        return customPolygon([
            new PointNRound(new Offset.Offset(0.828, 0.970), new CornerRounding.CornerRounding(0.169)),
            new PointNRound(new Offset.Offset(0.172, 0.970), new CornerRounding.CornerRounding(0.169)),
            new PointNRound(new Offset.Offset(-0.030, 0.365), new CornerRounding.CornerRounding(0.164)),
            new PointNRound(new Offset.Offset(0.500, -0.009), new CornerRounding.CornerRounding(0.172)),
            new PointNRound(new Offset.Offset(1.030, 0.365), new CornerRounding.CornerRounding(0.164)),
        ], 1).normalized();
    }

    function gem() {
        return customPolygon([
            new PointNRound(new Offset.Offset(1.005, 0.792), new CornerRounding.CornerRounding(0.208)),
            new PointNRound(new Offset.Offset(0.5, 1.023), new CornerRounding.CornerRounding(0.241, 0.778)),
            new PointNRound(new Offset.Offset(-0.005, 0.792), new CornerRounding.CornerRounding(0.208)),
            new PointNRound(new Offset.Offset(0.073, 0.258), new CornerRounding.CornerRounding(0.228)),
            new PointNRound(new Offset.Offset(0.5, 0.000), new CornerRounding.CornerRounding(0.241, 0.778)),
            new PointNRound(new Offset.Offset(0.927, 0.258), new CornerRounding.CornerRounding(0.228)),
        ], 1).normalized();
    }

    function sunny() {
        return RoundedPolygon.RoundedPolygon.star(8, 1, 0.8, cornerRound15)
            .transformed((x, y) => rotate45.map(new Offset.Offset(x, y)))
            .normalized();
    }

    function verySunny() {
        return customPolygon([
            new PointNRound(new Offset.Offset(0.500, 1.080), new CornerRounding.CornerRounding(0.085)),
            new PointNRound(new Offset.Offset(0.358, 0.843), new CornerRounding.CornerRounding(0.085)),
        ], 8)
            .transformed((x, y) => rotateNeg45.map(new Offset.Offset(x, y)))
            .normalized();
    }

    function cookie4() {
        return customPolygon([
            new PointNRound(new Offset.Offset(1.237, 1.236), new CornerRounding.CornerRounding(0.258)),
            new PointNRound(new Offset.Offset(0.500, 0.918), new CornerRounding.CornerRounding(0.233)),
        ], 4).normalized();
    }

    function cookie6() {
        return customPolygon([
            new PointNRound(new Offset.Offset(0.723, 0.884), new CornerRounding.CornerRounding(0.394)),
            new PointNRound(new Offset.Offset(0.500, 1.099), new CornerRounding.CornerRounding(0.398)),
        ], 6).normalized();
    }

    function cookie7() {
        return RoundedPolygon.RoundedPolygon.star(7, 1, 0.75, cornerRound50)
            .normalized()
            .transformed((x, y) => rotate28th.map(new Offset.Offset(x, y)))
            .transformed((x, y) => rotate28th.map(new Offset.Offset(x, y)))
            .transformed((x, y) => rotate28th.map(new Offset.Offset(x, y)))
            .transformed((x, y) => rotate28th.map(new Offset.Offset(x, y)))
            .transformed((x, y) => rotate28th.map(new Offset.Offset(x, y)))
            .normalized();
    }

    function cookie9() {
        return RoundedPolygon.RoundedPolygon.star(9, 1, 0.8, cornerRound50)
            .transformed((x, y) => rotate30.map(new Offset.Offset(x, y)))
            .normalized();
    }

    function cookie12() {
        return RoundedPolygon.RoundedPolygon.star(12, 1, 0.8, cornerRound50)
            .transformed((x, y) => rotate30.map(new Offset.Offset(x, y)))
            .normalized();
    }

    function ghostish() {
        return customPolygon([
            new PointNRound(new Offset.Offset(1.000, 1.140), new CornerRounding.CornerRounding(0.254, 0.106)),
            new PointNRound(new Offset.Offset(0.575, 0.906), new CornerRounding.CornerRounding(0.253)),
            new PointNRound(new Offset.Offset(0.425, 0.906), new CornerRounding.CornerRounding(0.253)),
            new PointNRound(new Offset.Offset(0.000, 1.140), new CornerRounding.CornerRounding(0.254, 0.106)),
            new PointNRound(new Offset.Offset(0.000, 0.000), new CornerRounding.CornerRounding(1.0)),
            new PointNRound(new Offset.Offset(0.500, 0.000), new CornerRounding.CornerRounding(1.0)),
            new PointNRound(new Offset.Offset(1.000, 0.000), new CornerRounding.CornerRounding(1.0)),
        ], 1).normalized();
    }

    function clover4() {
        return customPolygon([
            new PointNRound(new Offset.Offset(1.099, 0.725), new CornerRounding.CornerRounding(0.476)),
            new PointNRound(new Offset.Offset(0.725, 1.099), new CornerRounding.CornerRounding(0.476)),
            new PointNRound(new Offset.Offset(0.500, 0.926)),
        ], 4).normalized();
    }

    function clover8() {
        return customPolygon([
            new PointNRound(new Offset.Offset(0.758, 1.101), new CornerRounding.CornerRounding(0.209)),
            new PointNRound(new Offset.Offset(0.500, 0.964)),
        ], 8).normalized();
    }

    function burst() {
        return customPolygon([
            new PointNRound(new Offset.Offset(0.592, 0.842), new CornerRounding.CornerRounding(0.006)),
            new PointNRound(new Offset.Offset(0.500, 1.006), new CornerRounding.CornerRounding(0.006)),
        ], 12)
            .transformed((x, y) => rotateNeg30.map(new Offset.Offset(x, y)))
            .transformed((x, y) => rotateNeg30.map(new Offset.Offset(x, y)))
            .normalized();
    }

    function softBurst() {
        return customPolygon([
            new PointNRound(new Offset.Offset(0.193, 0.277), new CornerRounding.CornerRounding(0.053)),
            new PointNRound(new Offset.Offset(0.176, 0.055), new CornerRounding.CornerRounding(0.053)),
        ], 10)
            .transformed((x, y) => rotate180.map(new Offset.Offset(x, y)))
            .normalized();
    }

    function boom() {
        return customPolygon([
            new PointNRound(new Offset.Offset(0.457, 0.296), new CornerRounding.CornerRounding(0.007)),
            new PointNRound(new Offset.Offset(0.500, -0.051), new CornerRounding.CornerRounding(0.007)),
        ], 15)
            .transformed((x, y) => rotate120.map(new Offset.Offset(x, y)))
            .normalized();
    }

    function softBoom() {
        return customPolygon([
            new PointNRound(new Offset.Offset(0.733, 0.454)),
            new PointNRound(new Offset.Offset(0.839, 0.437), new CornerRounding.CornerRounding(0.532)),
            new PointNRound(new Offset.Offset(0.949, 0.449), new CornerRounding.CornerRounding(0.439, 1.000)),
            new PointNRound(new Offset.Offset(0.998, 0.478), new CornerRounding.CornerRounding(0.174)),
            // mirrored points
            new PointNRound(new Offset.Offset(0.998, 0.522), new CornerRounding.CornerRounding(0.174)),
            new PointNRound(new Offset.Offset(0.949, 0.551), new CornerRounding.CornerRounding(0.439, 1.000)),
            new PointNRound(new Offset.Offset(0.839, 0.563), new CornerRounding.CornerRounding(0.532)),
            new PointNRound(new Offset.Offset(0.733, 0.546)),
        ], 16)
            .transformed((x, y) => rotate45.map(new Offset.Offset(x, y)))
            .transformed((x, y) => rotateNeg16th.map(new Offset.Offset(x, y)))
            .normalized();
    }

    function flower() {
        return customPolygon([
            new PointNRound(new Offset.Offset(0.370, 0.187)),
            new PointNRound(new Offset.Offset(0.416, 0.049), new CornerRounding.CornerRounding(0.381)),
            new PointNRound(new Offset.Offset(0.479, 0.001), new CornerRounding.CornerRounding(0.095)),
            // mirrored points
            new PointNRound(new Offset.Offset(0.521, 0.001), new CornerRounding.CornerRounding(0.095)),
            new PointNRound(new Offset.Offset(0.584, 0.049), new CornerRounding.CornerRounding(0.381)),
            new PointNRound(new Offset.Offset(0.630, 0.187)),
        ], 8)
            .transformed((x, y) => rotate135.map(new Offset.Offset(x, y)))
            .normalized();
    }

    function puffy() {
        const m = new Matrix.Matrix();
        m.scale(1, 0.742);
        const shape = customPolygon([
            // mirrored points
            new PointNRound(new Offset.Offset(1.003, 0.563), new CornerRounding.CornerRounding(0.255)),
            new PointNRound(new Offset.Offset(0.940, 0.656), new CornerRounding.CornerRounding(0.126)),
            new PointNRound(new Offset.Offset(0.881, 0.654)),
            new PointNRound(new Offset.Offset(0.926, 0.711), new CornerRounding.CornerRounding(0.660)),
            new PointNRound(new Offset.Offset(0.914, 0.851), new CornerRounding.CornerRounding(0.660)),
            new PointNRound(new Offset.Offset(0.777, 0.998), new CornerRounding.CornerRounding(0.360)),
            new PointNRound(new Offset.Offset(0.722, 0.872)),
            new PointNRound(new Offset.Offset(0.717, 0.934), new CornerRounding.CornerRounding(0.574)),
            new PointNRound(new Offset.Offset(0.670, 1.035), new CornerRounding.CornerRounding(0.426)),
            new PointNRound(new Offset.Offset(0.545, 1.040), new CornerRounding.CornerRounding(0.405)),
            new PointNRound(new Offset.Offset(0.500, 0.947)),
            // original points
            new PointNRound(new Offset.Offset(0.500, 1-0.053)),
            new PointNRound(new Offset.Offset(1-0.545, 1+0.040), new CornerRounding.CornerRounding(0.405)),
            new PointNRound(new Offset.Offset(1-0.670, 1+0.035), new CornerRounding.CornerRounding(0.426)),
            new PointNRound(new Offset.Offset(1-0.717, 1-0.066), new CornerRounding.CornerRounding(0.574)),
            new PointNRound(new Offset.Offset(1-0.722, 1-0.128)),
            new PointNRound(new Offset.Offset(1-0.777, 1-0.002), new CornerRounding.CornerRounding(0.360)),
            new PointNRound(new Offset.Offset(1-0.914, 1-0.149), new CornerRounding.CornerRounding(0.660)),
            new PointNRound(new Offset.Offset(1-0.926, 1-0.289), new CornerRounding.CornerRounding(0.660)),
            new PointNRound(new Offset.Offset(1-0.881, 1-0.346)),
            new PointNRound(new Offset.Offset(1-0.940, 1-0.344), new CornerRounding.CornerRounding(0.126)),
            new PointNRound(new Offset.Offset(1-1.003, 1-0.437), new CornerRounding.CornerRounding(0.255)),
        ], 2);
        return shape.transformed((x, y) => m.map(new Offset.Offset(x, y))).normalized();
    }

    function puffyDiamond() {
        return customPolygon([
            // original points
            new PointNRound(new Offset.Offset(0.870, 0.130), new CornerRounding.CornerRounding(0.146)),
            new PointNRound(new Offset.Offset(0.818, 0.357)),
            new PointNRound(new Offset.Offset(1.000, 0.332), new CornerRounding.CornerRounding(0.853)),
            // mirrored points
            new PointNRound(new Offset.Offset(1.000, 1-0.332), new CornerRounding.CornerRounding(0.853)),
            new PointNRound(new Offset.Offset(0.818, 1-0.357)),
        ], 4)
            .transformed((x, y) => rotate90.map(new Offset.Offset(x, y)))
            .normalized();
    }

    function pixelCircle() {
        return customPolygon([
            new PointNRound(new Offset.Offset(1.000, 0.704)),
            new PointNRound(new Offset.Offset(0.926, 0.704)),
            new PointNRound(new Offset.Offset(0.926, 0.852)),
            new PointNRound(new Offset.Offset(0.843, 0.852)),
            new PointNRound(new Offset.Offset(0.843, 0.935)),
            new PointNRound(new Offset.Offset(0.704, 0.935)),
            new PointNRound(new Offset.Offset(0.704, 1.000)),
            new PointNRound(new Offset.Offset(0.500, 1.000)),
            new PointNRound(new Offset.Offset(1-0.704, 1.000)),
            new PointNRound(new Offset.Offset(1-0.704, 0.935)),
            new PointNRound(new Offset.Offset(1-0.843, 0.935)),
            new PointNRound(new Offset.Offset(1-0.843, 0.852)),
            new PointNRound(new Offset.Offset(1-0.926, 0.852)),
            new PointNRound(new Offset.Offset(1-0.926, 0.704)),
            new PointNRound(new Offset.Offset(1-1.000, 0.704)),
        ], 2)
            .normalized();
    }

    function pixelTriangle() {
        return customPolygon([
            // mirrored points
            new PointNRound(new Offset.Offset(0.888, 1-0.439)),
            new PointNRound(new Offset.Offset(0.789, 1-0.439)),
            new PointNRound(new Offset.Offset(0.789, 1-0.344)),
            new PointNRound(new Offset.Offset(0.675, 1-0.344)),
            new PointNRound(new Offset.Offset(0.674, 1-0.265)),
            new PointNRound(new Offset.Offset(0.560, 1-0.265)),
            new PointNRound(new Offset.Offset(0.560, 1-0.170)),
            new PointNRound(new Offset.Offset(0.421, 1-0.170)),
            new PointNRound(new Offset.Offset(0.421, 1-0.087)),
            new PointNRound(new Offset.Offset(0.287, 1-0.087)),
            new PointNRound(new Offset.Offset(0.287, 1-0.000)),
            new PointNRound(new Offset.Offset(0.113, 1-0.000)),
            // original points
            new PointNRound(new Offset.Offset(0.110, 0.500)),
            new PointNRound(new Offset.Offset(0.113, 0.000)),
            new PointNRound(new Offset.Offset(0.287, 0.000)),
            new PointNRound(new Offset.Offset(0.287, 0.087)),
            new PointNRound(new Offset.Offset(0.421, 0.087)),
            new PointNRound(new Offset.Offset(0.421, 0.170)),
            new PointNRound(new Offset.Offset(0.560, 0.170)),
            new PointNRound(new Offset.Offset(0.560, 0.265)),
            new PointNRound(new Offset.Offset(0.674, 0.265)),
            new PointNRound(new Offset.Offset(0.675, 0.344)),
            new PointNRound(new Offset.Offset(0.789, 0.344)),
            new PointNRound(new Offset.Offset(0.789, 0.439)),
            new PointNRound(new Offset.Offset(0.888, 0.439)),
        ], 1).normalized();
    }

    function bun() {
        return customPolygon([
            // original points
            new PointNRound(new Offset.Offset(0.796, 0.500)),
            new PointNRound(new Offset.Offset(0.853, 0.518), cornerRound100),
            new PointNRound(new Offset.Offset(0.992, 0.631), cornerRound100),
            new PointNRound(new Offset.Offset(0.968, 1.000), cornerRound100), 
            // mirrored points
            new PointNRound(new Offset.Offset(0.032, 1-0.000), cornerRound100),
            new PointNRound(new Offset.Offset(0.008, 1-0.369), cornerRound100),
            new PointNRound(new Offset.Offset(0.147, 1-0.482), cornerRound100),
            new PointNRound(new Offset.Offset(0.204, 1-0.500)),
        ], 2).normalized();
    }

    function heart() {
        return customPolygon([
            new PointNRound(new Offset.Offset(0.782, 0.611)),
            new PointNRound(new Offset.Offset(0.499, 0.946), new CornerRounding.CornerRounding(0.000)),
            new PointNRound(new Offset.Offset(0.2175, 0.611)),
            new PointNRound(new Offset.Offset(-0.064, 0.276), new CornerRounding.CornerRounding(1.000)),
            new PointNRound(new Offset.Offset(0.208, -0.066), new CornerRounding.CornerRounding(0.958)),
            new PointNRound(new Offset.Offset(0.500, 0.268), new CornerRounding.CornerRounding(0.016)),
            new PointNRound(new Offset.Offset(0.792, -0.066), new CornerRounding.CornerRounding(0.958)),
            new PointNRound(new Offset.Offset(1.064, 0.276), new CornerRounding.CornerRounding(1.000)),
        ], 1)
            .normalized();
    }

    class PointNRound {
        constructor(o, r = CornerRounding.Unrounded) {
            this.o = o;
            this.r = r;
        }
    }

    function doRepeat(points, reps, center, mirroring) {
        if (mirroring) {
            const result = [];
            const angles = points.map(p => p.o.minus(center).angleDegrees());
            const distances = points.map(p => p.o.minus(center).getDistance());
            const actualReps = reps * 2;
            const sectionAngle = 360 / actualReps;
            for (let it = 0; it < actualReps; it++) {
                for (let index = 0; index < points.length; index++) {
                    const i = (it % 2 === 0) ? index : points.length - 1 - index;
                    if (i > 0 || it % 2 === 0) {
                        const baseAngle = angles[i];
                        const angle = it * sectionAngle + (it % 2 === 0 ? baseAngle : (2 * angles[0] - baseAngle));
                        const dist = distances[i];
                        const rad = angle * Math.PI / 180;
                        const x = center.x + dist * Math.cos(rad);
                        const y = center.y + dist * Math.sin(rad);
                        result.push(new PointNRound(new Offset.Offset(x, y), points[i].r));
                    }
                }
            }
            return result;
        } else {
            const np = points.length;
            const result = [];
            for (let i = 0; i < np * reps; i++) {
                const point = points[i % np].o.rotateDegrees(Math.floor(i / np) * 360 / reps, center);
                result.push(new PointNRound(point, points[i % np].r));
            }
            return result;
        }
    }

    function customPolygon(pnr, reps = 1, center = new Offset.Offset(0.5, 0.5), mirroring = false) {
        const actualPoints = doRepeat(pnr, reps, center, mirroring);
        const vertices = [];
        for (const p of actualPoints) {
            vertices.push(p.o.x);
            vertices.push(p.o.y);
        }
        const perVertexRounding = actualPoints.map(p => p.r);
        return RoundedPolygon.RoundedPolygon.fromVertices(vertices, CornerRounding.Unrounded, perVertexRounding, center.x, center.y);
    }
    return { _circle, _square, _slanted, _arch, _fan, _arrow, _semiCircle, _oval, _pill, _triangle, _diamond, _clamShell, _pentagon, _gem, _verySunny, _sunny, _cookie4Sided, _cookie6Sided, _cookie7Sided, _cookie9Sided, _cookie12Sided, _ghostish, _clover4Leaf, _clover8Leaf, _burst, _softBurst, _boom, _softBoom, _flower, _puffy, _puffyDiamond, _pixelCircle, _pixelTriangle, _bun, _heart, cornerRound15, cornerRound20, cornerRound30, cornerRound50, cornerRound100, rotateNeg30, rotateNeg45, rotateNeg90, rotateNeg135, rotate30, rotate45, rotate60, rotate90, rotate120, rotate135, rotate180, rotate28th, rotateNeg16th, getCircle, getSquare, getSlanted, getArch, getFan, getArrow, getSemiCircle, getOval, getPill, getTriangle, getDiamond, getClamShell, getPentagon, getGem, getSunny, getVerySunny, getCookie4Sided, getCookie6Sided, getCookie7Sided, getCookie9Sided, getCookie12Sided, getGhostish, getClover4Leaf, getClover8Leaf, getBurst, getSoftBurst, getBoom, getSoftBoom, getFlower, getPuffy, getPuffyDiamond, getPixelCircle, getPixelTriangle, getBun, getHeart, circle, square, slanted, arch, fan, arrow, semiCircle, oval, pill, triangle, diamond, clamShell, pentagon, gem, sunny, verySunny, cookie4, cookie6, cookie7, cookie9, cookie12, ghostish, clover4, clover8, burst, softBurst, boom, softBoom, flower, puffy, puffyDiamond, pixelCircle, pixelTriangle, bun, heart, PointNRound, doRepeat, customPolygon };
  },
  "shapes/corner-rounding.js": function (__require) {
    /**
     * Represents corner rounding configuration
     */
    class CornerRounding {
        /**
         * @param {float} [radius=0]
         * @param {float} [smoothing=0]
         */
        constructor(radius = 0, smoothing = 0) {
            this.radius = radius;
            this.smoothing = smoothing;
        }
    }

    // Static property
    CornerRounding.Unrounded = new CornerRounding();
    return { CornerRounding };
  },
  "shapes/cubic.js": function (__require) {
    const PointModule = __require("shapes/point.js");
    const UtilsModule = __require("shapes/utils.js");
    var Point = PointModule.Point;
    var DistanceEpsilon = UtilsModule.DistanceEpsilon;
    var interpolate = UtilsModule.interpolate;
    var directionVector = UtilsModule.directionVector;
    var distance = UtilsModule.distance;

    /**
     * Represents a cubic Bézier curve with anchor and control points
     */
    class Cubic {
        /**
         * @param {Array<float>} points Array of 8 numbers [anchor0X, anchor0Y, control0X, control0Y, control1X, control1Y, anchor1X, anchor1Y]
         */
        constructor(points) {
            this.points = points;
        }

        get anchor0X() { return this.points[0]; }
        get anchor0Y() { return this.points[1]; }
        get control0X() { return this.points[2]; }
        get control0Y() { return this.points[3]; }
        get control1X() { return this.points[4]; }
        get control1Y() { return this.points[5]; }
        get anchor1X() { return this.points[6]; }
        get anchor1Y() { return this.points[7]; }

        /**
         * @param {Point} anchor0
         * @param {Point} control0
         * @param {Point} control1
         * @param {Point} anchor1
         * @returns {Cubic}
         */
        static create(anchor0, control0, control1, anchor1) {
            return new Cubic([
                anchor0.x, anchor0.y,
                control0.x, control0.y,
                control1.x, control1.y,
                anchor1.x, anchor1.y
            ]);
        }

        /**
         * @param {float} t
         * @returns {Point}
         */
        pointOnCurve(t) {
            const u = 1 - t;
            return new Point(
                this.anchor0X * (u * u * u) +
                this.control0X * (3 * t * u * u) +
                this.control1X * (3 * t * t * u) +
                this.anchor1X * (t * t * t),
                this.anchor0Y * (u * u * u) +
                this.control0Y * (3 * t * u * u) +
                this.control1Y * (3 * t * t * u) +
                this.anchor1Y * (t * t * t)
            );
        }

        /**
         * @returns {boolean}
         */
        zeroLength() {
            return Math.abs(this.anchor0X - this.anchor1X) < DistanceEpsilon &&
                   Math.abs(this.anchor0Y - this.anchor1Y) < DistanceEpsilon;
        }

        /**
         * @param {Cubic} next
         * @returns {boolean}
         */
        convexTo(next) {
            const prevVertex = new Point(this.anchor0X, this.anchor0Y);
            const currVertex = new Point(this.anchor1X, this.anchor1Y);
            const nextVertex = new Point(next.anchor1X, next.anchor1Y);
            return convex(prevVertex, currVertex, nextVertex);
        }

        /**
         * @param {float} value
         * @returns {boolean}
         */
        zeroIsh(value) {
            return Math.abs(value) < DistanceEpsilon;
        }

        /**
         * @param {Array<float>} bounds
         * @param {boolean} [approximate=false]
         */
        calculateBounds(bounds, approximate = false) {
            if (this.zeroLength()) {
                bounds[0] = this.anchor0X;
                bounds[1] = this.anchor0Y;
                bounds[2] = this.anchor0X;
                bounds[3] = this.anchor0Y;
                return;
            }

            let minX = Math.min(this.anchor0X, this.anchor1X);
            let minY = Math.min(this.anchor0Y, this.anchor1Y);
            let maxX = Math.max(this.anchor0X, this.anchor1X);
            let maxY = Math.max(this.anchor0Y, this.anchor1Y);

            if (approximate) {
                bounds[0] = Math.min(minX, Math.min(this.control0X, this.control1X));
                bounds[1] = Math.min(minY, Math.min(this.control0Y, this.control1Y));
                bounds[2] = Math.max(maxX, Math.max(this.control0X, this.control1X));
                bounds[3] = Math.max(maxY, Math.max(this.control0Y, this.control1Y));
                return;
            }

            // Find extrema using derivatives
            const xa = -this.anchor0X + 3 * this.control0X - 3 * this.control1X + this.anchor1X;
            const xb = 2 * this.anchor0X - 4 * this.control0X + 2 * this.control1X;
            const xc = -this.anchor0X + this.control0X;

            if (this.zeroIsh(xa)) {
                if (xb != 0) {
                    const t = 2 * xc / (-2 * xb);
                    if (t >= 0 && t <= 1) {
                        const it = this.pointOnCurve(t).x;
                        if (it < minX) minX = it;
                        if (it > maxX) maxX = it;
                    }
                }
            } else {
                const xs = xb * xb - 4 * xa * xc;
                if (xs >= 0) {
                    const t1 = (-xb + Math.sqrt(xs)) / (2 * xa);
                    if (t1 >= 0 && t1 <= 1) {
                        const it = this.pointOnCurve(t1).x;
                        if (it < minX) minX = it;
                        if (it > maxX) maxX = it;
                    }

                    const t2 = (-xb - Math.sqrt(xs)) / (2 * xa);
                    if (t2 >= 0 && t2 <= 1) {
                        const it = this.pointOnCurve(t2).x;
                        if (it < minX) minX = it;
                        if (it > maxX) maxX = it;
                    }
                }
            }

            // Repeat for y coord
            const ya = -this.anchor0Y + 3 * this.control0Y - 3 * this.control1Y + this.anchor1Y;
            const yb = 2 * this.anchor0Y - 4 * this.control0Y + 2 * this.control1Y;
            const yc = -this.anchor0Y + this.control0Y;

            if (this.zeroIsh(ya)) {
                if (yb != 0) {
                    const t = 2 * yc / (-2 * yb);
                    if (t >= 0 && t <= 1) {
                        const it = this.pointOnCurve(t).y;
                        if (it < minY) minY = it;
                        if (it > maxY) maxY = it;
                    }
                }
            } else {
                const ys = yb * yb - 4 * ya * yc;
                if (ys >= 0) {
                    const t1 = (-yb + Math.sqrt(ys)) / (2 * ya);
                    if (t1 >= 0 && t1 <= 1) {
                        const it = this.pointOnCurve(t1).y;
                        if (it < minY) minY = it;
                        if (it > maxY) maxY = it;
                    }

                    const t2 = (-yb - Math.sqrt(ys)) / (2 * ya);
                    if (t2 >= 0 && t2 <= 1) {
                        const it = this.pointOnCurve(t2).y;
                        if (it < minY) minY = it;
                        if (it > maxY) maxY = it;
                    }
                }
            }
            bounds[0] = minX;
            bounds[1] = minY;
            bounds[2] = maxX;
            bounds[3] = maxY;
        }

        /**
         * @param {float} t
         * @returns {{a: Cubic, b: Cubic}}
         */
        split(t) {
            const u = 1 - t;
            const pointOnCurve = this.pointOnCurve(t);
            return {
                a: new Cubic([
                    this.anchor0X,
                    this.anchor0Y,
                    this.anchor0X * u + this.control0X * t,
                    this.anchor0Y * u + this.control0Y * t,
                    this.anchor0X * (u * u) + this.control0X * (2 * u * t) + this.control1X * (t * t),
                    this.anchor0Y * (u * u) + this.control0Y * (2 * u * t) + this.control1Y * (t * t),
                    pointOnCurve.x,
                    pointOnCurve.y
                ]),
                b: new Cubic([
                    pointOnCurve.x,
                    pointOnCurve.y,
                    this.control0X * (u * u) + this.control1X * (2 * u * t) + this.anchor1X * (t * t),
                    this.control0Y * (u * u) + this.control1Y * (2 * u * t) + this.anchor1Y * (t * t),
                    this.control1X * u + this.anchor1X * t,
                    this.control1Y * u + this.anchor1Y * t,
                    this.anchor1X,
                    this.anchor1Y
                ])
            };
        }

        /**
         * @returns {Cubic}
         */
        reverse() {
            return new Cubic([
                this.anchor1X, this.anchor1Y,
                this.control1X, this.control1Y,
                this.control0X, this.control0Y,
                this.anchor0X, this.anchor0Y
            ]);
        }

        /**
         * @param {Cubic} other
         * @returns {Cubic}
         */
        plus(other) {
            return new Cubic(other.points.map((_, index) => this.points[index] + other.points[index]));
        }

        /**
         * @param {float} x
         * @returns {Cubic}
         */
        times(x) {
            return new Cubic(this.points.map(v => v * x));
        }

        /**
         * @param {float} x
         * @returns {Cubic}
         */
        div(x) {
            return this.times(1 / x);
        }

        /**
         * @param {Cubic} other
         * @returns {boolean}
         */
        equals(other) {
            return this.points.every((p, i) => other.points[i] === p);
        }

        /**
         * @param {function(float, float): Point} f
         * @returns {Cubic}
         */
        transformed(f) {
            const newCubic = new MutableCubic([...this.points]);
            newCubic.transform(f);
            return newCubic;
        }

        /**
         * @param {float} x0
         * @param {float} y0
         * @param {float} x1
         * @param {float} y1
         * @returns {Cubic}
         */
        static straightLine(x0, y0, x1, y1) {
            return new Cubic([
                x0,
                y0,
                interpolate(x0, x1, 1/3),
                interpolate(y0, y1, 1/3),
                interpolate(x0, x1, 2/3),
                interpolate(y0, y1, 2/3),
                x1,
                y1
            ]);
        }

        /**
         * @param {float} centerX
         * @param {float} centerY
         * @param {float} x0
         * @param {float} y0
         * @param {float} x1
         * @param {float} y1
         * @returns {Cubic}
         */
        static circularArc(centerX, centerY, x0, y0, x1, y1) {
            const p0d = directionVector(x0 - centerX, y0 - centerY);
            const p1d = directionVector(x1 - centerX, y1 - centerY);
            const rotatedP0 = p0d.rotate90();
            const rotatedP1 = p1d.rotate90();
            const clockwise = rotatedP0.dotProductScalar(x1 - centerX, y1 - centerY) >= 0;
            const cosa = p0d.dotProduct(p1d);
            
            if (cosa > 0.999) {
                return Cubic.straightLine(x0, y0, x1, y1);
            }

            const k = distance(x0 - centerX, y0 - centerY) * 4/3 * 
                     (Math.sqrt(2 * (1 - cosa)) - Math.sqrt(1 - cosa * cosa)) / 
                     (1 - cosa) * (clockwise ? 1 : -1);
                     
            return new Cubic([
                x0, y0,
                x0 + rotatedP0.x * k,
                y0 + rotatedP0.y * k,
                x1 - rotatedP1.x * k,
                y1 - rotatedP1.y * k,
                x1, y1
            ]);
        }

        /**
         * @param {float} x0
         * @param {float} y0
         * @returns {Cubic}
         */
        static empty(x0, y0) {
            return new Cubic([x0, y0, x0, y0, x0, y0, x0, y0]);
        }
    }

    class MutableCubic extends Cubic {
        /**
         * @param {function(float, float): Point} f
         */
        transform(f) {
            this.transformOnePoint(f, 0);
            this.transformOnePoint(f, 2);
            this.transformOnePoint(f, 4);
            this.transformOnePoint(f, 6);
        }

        /**
         * @param {Cubic} c1
         * @param {Cubic} c2
         * @param {float} progress
         */
        interpolate(c1, c2, progress) {
            for (let i = 0; i < 8; i++) {
                this.points[i] = interpolate(c1.points[i], c2.points[i], progress);
            }
        }

        /**
         * @private
         * @param {function(float, float): Point} f
         * @param {number} ix
         */
        transformOnePoint(f, ix) {
            const result = f(this.points[ix], this.points[ix + 1]);
            this.points[ix] = result.x;
            this.points[ix + 1] = result.y;
        }
    }
    return { Point, DistanceEpsilon, interpolate, directionVector, distance, Cubic, MutableCubic };
  },
  "shapes/feature-mapping.js": function (__require) {
    const FeatureModule = __require("shapes/feature.js");
    const MappingModule = __require("shapes/float-mapping.js");
    const PointModule = __require("shapes/point.js");
    const UtilsModule = __require("shapes/utils.js");
    var Feature = FeatureModule.Feature;
    var Corner = FeatureModule.Corner;
    var Point = PointModule.Point;
    var DoubleMapper = MappingModule.DoubleMapper;
    var progressInRange = MappingModule.progressInRange;
    var DistanceEpsilon = UtilsModule.DistanceEpsilon;

    var IdentityMapping = [{ a: 0, b: 0 }, { a: 0.5, b: 0.5 }];

    class ProgressableFeature {
        /**
         * @param {float} progress
         * @param {Feature} feature
         */
        constructor(progress, feature) {
            this.progress = progress;
            this.feature = feature;
        }
    }

    class DistanceVertex {
        /**
         * @param {float} distance
         * @param {ProgressableFeature} f1
         * @param {ProgressableFeature} f2
         */
        constructor(distance, f1, f2) {
            this.distance = distance;
            this.f1 = f1;
            this.f2 = f2;
        }
    }

    class MappingHelper {
        constructor() {
            this.mapping = [];
            this.usedF1 = new Set();
            this.usedF2 = new Set();
        }

        /**
         * @param {ProgressableFeature} f1
         * @param {ProgressableFeature} f2
         */
        addMapping(f1, f2) {
            if (this.usedF1.has(f1) || this.usedF2.has(f2)) {
                return;
            }

            const index = this.mapping.findIndex(x => x.a === f1.progress);
            const insertionIndex = -index - 1;
            const n = this.mapping.length;

            if (n >= 1) {
                const { a: before1, b: before2 } = this.mapping[(insertionIndex + n - 1) % n];
                const { a: after1, b: after2 } = this.mapping[insertionIndex % n];

                if (
                    progressDistance(f1.progress, before1) < DistanceEpsilon ||
                    progressDistance(f1.progress, after1) < DistanceEpsilon ||
                    progressDistance(f2.progress, before2) < DistanceEpsilon ||
                    progressDistance(f2.progress, after2) < DistanceEpsilon
                ) {
                    return;
                }

                if (n > 1 && !progressInRange(f2.progress, before2, after2)) {
                    return;
                }
            }

            this.mapping.splice(insertionIndex, 0, { a: f1.progress, b: f2.progress });
            this.usedF1.add(f1);
            this.usedF2.add(f2);
        }
    }

    /**
     * @param {Array<ProgressableFeature>} features1
     * @param {Array<ProgressableFeature>} features2
     * @returns {DoubleMapper}
     */
    function featureMapper(features1, features2) {
        const filteredFeatures1 = features1.filter(f => f.feature instanceof Corner);
        const filteredFeatures2 = features2.filter(f => f.feature instanceof Corner);

        const featureProgressMapping = doMapping(filteredFeatures1, filteredFeatures2);
        return new DoubleMapper(...featureProgressMapping);
    }

    /**
     * @param {Array<ProgressableFeature>} features1
     * @param {Array<ProgressableFeature>} features2
     * @returns {Array<{a: float, b: float}>}
     */
    function doMapping(features1, features2) {
        const distanceVertexList = [];
        
        for (const f1 of features1) {
            for (const f2 of features2) {
                const d = featureDistSquared(f1.feature, f2.feature);
                if (d !== Number.MAX_VALUE) {
                    distanceVertexList.push(new DistanceVertex(d, f1, f2));
                }
            }
        }
        
        distanceVertexList.sort((a, b) => a.distance - b.distance);

        // Special cases
        if (distanceVertexList.length === 0) {
            return IdentityMapping;
        } else if (distanceVertexList.length === 1) {
            const { f1, f2 } = distanceVertexList[0];
            const p1 = f1.progress;
            const p2 = f2.progress;
            return [
                { a: p1, b: p2 },
                { a: (p1 + 0.5) % 1, b: (p2 + 0.5) % 1 }
            ];
        }

        const helper = new MappingHelper();
        distanceVertexList.forEach(({ f1, f2 }) => helper.addMapping(f1, f2));
        return helper.mapping;
    }

    /**
     * @param {Feature} f1
     * @param {Feature} f2
     * @returns {float}
     */
    function featureDistSquared(f1, f2) {
        if (f1 instanceof Corner && f2 instanceof Corner && f1.convex != f2.convex) {
            return Number.MAX_VALUE;
        }
        return featureRepresentativePoint(f1).minus(featureRepresentativePoint(f2)).getDistanceSquared();
    }

    /**
     * @param {Feature} feature
     * @returns {Point}
     */
    function featureRepresentativePoint(feature) {
        const firstCubic = feature.cubics[0];
        const lastCubic = feature.cubics[feature.cubics.length - 1];
        const x = (firstCubic.anchor0X + lastCubic.anchor1X) / 2;
        const y = (firstCubic.anchor0Y + lastCubic.anchor1Y) / 2;
        return new Point(x, y);
    }

    /**
     * @param {float} p1
     * @param {float} p2
     * @returns {float}
     */
    function progressDistance(p1, p2) {
        const it = Math.abs(p1 - p2);
        return Math.min(it, 1 - it);
    }
    return { Feature, Corner, Point, DoubleMapper, progressInRange, DistanceEpsilon, IdentityMapping, ProgressableFeature, DistanceVertex, MappingHelper, featureMapper, doMapping, featureDistSquared, featureRepresentativePoint, progressDistance };
  },
  "shapes/feature.js": function (__require) {
    const CubicModule = __require("shapes/cubic.js");
    var Cubic = CubicModule.Cubic;

    /**
     * Base class for shape features (edges and corners)
     */
    class Feature {
        /**
         * @param {Array<Cubic>} cubics
         */
        constructor(cubics) {
            this.cubics = cubics;
        }

        /**
         * @param {Array<Cubic>} cubics
         * @returns {Edge}
         */
        buildIgnorableFeature(cubics) {
            return new Edge(cubics);
        }

        /**
         * @param {Cubic} cubic
         * @returns {Edge}
         */
        buildEdge(cubic) {
            return new Edge([cubic]);
        }

        /**
         * @param {Array<Cubic>} cubics
         * @returns {Corner}
         */
        buildConvexCorner(cubics) {
            return new Corner(cubics, true);
        }

        /**
         * @param {Array<Cubic>} cubics
         * @returns {Corner}
         */
        buildConcaveCorner(cubics) {
            return new Corner(cubics, false);
        }
    }

    class Edge extends Feature {
        constructor(cubics) {
            super(cubics);
            this.isIgnorableFeature = true;
            this.isEdge = true;
            this.isConvexCorner = false;
            this.isConcaveCorner = false;
        }

        /**
         * @param {function(float, float): Point} f
         * @returns {Feature}
         */
        transformed(f) {
            return new Edge(this.cubics.map(c => c.transformed(f)));
        }

        /**
         * @returns {Feature}
         */
        reversed() {
            return new Edge(this.cubics.map(c => c.reverse()));
        }
    }

    class Corner extends Feature {
        /**
         * @param {Array<Cubic>} cubics
         * @param {boolean} convex
         */
        constructor(cubics, convex) {
            super(cubics);
            this.convex = convex;
            this.isIgnorableFeature = false;
            this.isEdge = false;
            this.isConvexCorner = convex;
            this.isConcaveCorner = !convex;
        }

        /**
         * @param {function(float, float): Point} f
         * @returns {Feature}
         */
        transformed(f) {
            return new Corner(this.cubics.map(c => c.transformed(f)), this.convex);
        }

        /**
         * @returns {Feature}
         */
        reversed() {
            return new Corner(this.cubics.map(c => c.reverse()), !this.convex);
        }
    }
    return { Cubic, Feature, Edge, Corner };
  },
  "shapes/float-mapping.js": function (__require) {
    const UtilsModule = __require("shapes/utils.js");
    var positiveModulo = UtilsModule.positiveModulo;

    /**
     * Maps values between two ranges
     */
    class DoubleMapper {
        constructor(...mappings) {
            this.sourceValues = [];
            this.targetValues = [];
            
            for (const mapping of mappings) {
                this.sourceValues.push(mapping.a);
                this.targetValues.push(mapping.b);
            }
        }

        /**
         * @param {float} x
         * @returns {float}
         */
        map(x) {
            return linearMap(this.sourceValues, this.targetValues, x);
        }

        /**
         * @param {float} x
         * @returns {float}
         */
        mapBack(x) {
            return linearMap(this.targetValues, this.sourceValues, x);
        }
    }

    // Static property
    DoubleMapper.Identity = new DoubleMapper({ a: 0, b: 0 }, { a: 0.5, b: 0.5 });

    /**
     * @param {Array<float>} xValues
     * @param {Array<float>} yValues
     * @param {float} x
     * @returns {float}
     */
    function linearMap(xValues, yValues, x) {
        let segmentStartIndex = -1;
        for (let i = 0; i < xValues.length; i++) {
            const nextIndex = (i + 1) % xValues.length;
            if (progressInRange(x, xValues[i], xValues[nextIndex])) {
                segmentStartIndex = i;
                break;
            }
        }

        if (segmentStartIndex === -1) {
            throw new Error("No valid segment found");
        }

        const segmentEndIndex = (segmentStartIndex + 1) % xValues.length;
        const segmentSizeX = positiveModulo(xValues[segmentEndIndex] - xValues[segmentStartIndex], 1);
        const segmentSizeY = positiveModulo(yValues[segmentEndIndex] - yValues[segmentStartIndex], 1);

        let positionInSegment;
        if (segmentSizeX < 0.001) {
            positionInSegment = 0.5;
        } else {
            positionInSegment = positiveModulo(x - xValues[segmentStartIndex], 1) / segmentSizeX;
        }

        return positiveModulo(yValues[segmentStartIndex] + segmentSizeY * positionInSegment, 1);
    }

    /**
     * @param {float} progress
     * @param {float} progressFrom
     * @param {float} progressTo
     * @returns {boolean}
     */
    function progressInRange(progress, progressFrom, progressTo) {
        if (progressTo >= progressFrom) {
            return progress >= progressFrom && progress <= progressTo;
        } else {
            return progress >= progressFrom || progress <= progressTo;
        }
    }
    return { positiveModulo, DoubleMapper, linearMap, progressInRange };
  },
  "shapes/morph.js": function (__require) {
    const RoundedPolygon = __require("shapes/rounded-polygon.js");
    const Cubic = __require("shapes/cubic.js");
    const PolygonMeasure = __require("shapes/polygon-measure.js");
    const FeatureMapping = __require("shapes/feature-mapping.js");
    const Utils = __require("shapes/utils.js");
    class Morph {
        constructor(start, end) {
            this.morphMatch = this.match(start, end)
        }

        asCubics(progress) {
            const ret = []

            // The first/last mechanism here ensures that the final anchor point in the shape
            // exactly matches the first anchor point. There can be rendering artifacts introduced
            // by those points being slightly off, even by much less than a pixel
            let firstCubic = null
            let lastCubic = null
            for (let i = 0; i < this.morphMatch.length; i++) {
                const cubic = new Cubic.Cubic(Array.from({ length: 8 }).map((_, it) => Utils.interpolate(
                        this.morphMatch[i].a.points[it],
                        this.morphMatch[i].b.points[it],
                        progress,
                    )))
                if (firstCubic == null)
                    firstCubic = cubic
                if (lastCubic != null)
                    ret.push(lastCubic)
                lastCubic = cubic
            }
            if (lastCubic != null && firstCubic != null)
                ret.push(
                    new Cubic.Cubic([
                        lastCubic.anchor0X,
                        lastCubic.anchor0Y,
                        lastCubic.control0X,
                        lastCubic.control0Y,
                        lastCubic.control1X,
                        lastCubic.control1Y,
                        firstCubic.anchor0X,
                        firstCubic.anchor0Y,
                    ])
                )
            return ret
        }

        forEachCubic(progress, mutableCubic, callback) {
            for (let i = 0; i < this.morphMatch.length; i++) {
                mutableCubic.interpolate(this.morphMatch[i].a, this.morphMatch[i].b, progress)
                callback(mutableCubic)
            }
        }

        match(p1, p2) {
            const measurer = new PolygonMeasure.LengthMeasurer()
            const measuredPolygon1 = PolygonMeasure.MeasuredPolygon.measurePolygon(measurer, p1)
            const measuredPolygon2 = PolygonMeasure.MeasuredPolygon.measurePolygon(measurer, p2)

            const features1 = measuredPolygon1.features
            const features2 = measuredPolygon2.features

            const doubleMapper = FeatureMapping.featureMapper(features1, features2)

            const polygon2CutPoint = doubleMapper.map(0)

            const bs1 = measuredPolygon1
            const bs2 = measuredPolygon2.cutAndShift(polygon2CutPoint)

            const ret = []

            let i1 = 0
            let i2 = 0

            let b1 = bs1.cubics[i1++]
            let b2 = bs2.cubics[i2++]

            while (b1 != null && b2 != null) {
                const b1a = (i1 == bs1.cubics.length) ? 1 : b1.endOutlineProgress
                const b2a = (i2 == bs2.cubics.length) ? 1 : doubleMapper.mapBack(Utils.positiveModulo(b2.endOutlineProgress + polygon2CutPoint, 1))
                const minb = Math.min(b1a, b2a)
                const { a: seg1, b: newb1 } = b1a > minb + Utils.AngleEpsilon ? b1.cutAtProgress(minb) : { a: b1, b: bs1.cubics[i1++] }
                const { a: seg2, b: newb2 } = b2a > minb + Utils.AngleEpsilon ? b2.cutAtProgress(Utils.positiveModulo(doubleMapper.map(minb) - polygon2CutPoint, 1)) : { a: b2, b: bs2.cubics[i2++] }

                ret.push({ a: seg1.cubic, b: seg2.cubic })
                b1 = newb1
                b2 = newb2
            }

            return ret
        }
    }
    return { Morph };
  },
  "shapes/point.js": function (__require) {
    /**
     * @param {number} x
     * @param {number} y
     * @returns {Point}
     */
    function createPoint(x, y) {
        return new Point(x, y);
    }

    class Point {
        /**
         * @param {float} x
         * @param {float} y
         */
        constructor(x, y) {
            this.x = x;
            this.y = y;
        }

        /**
         * @param {float} x
         * @param {float} y
         * @returns {Point}
         */
        copy(x = this.x, y = this.y) {
            return new Point(x, y);
        }

        /**
         * @returns {float}
         */
        getDistance() {
            return Math.sqrt(this.x * this.x + this.y * this.y);
        }

        /**
         * @returns {float}
         */
        getDistanceSquared() {
            return this.x * this.x + this.y * this.y;
        }

        /**
         * @param {Point} other
         * @returns {float}
         */
        dotProduct(other) {
            return this.x * other.x + this.y * other.y;
        }

        /**
         * @param {float} otherX
         * @param {float} otherY
         * @returns {float}
         */
        dotProductScalar(otherX, otherY) {
            return this.x * otherX + this.y * otherY;
        }

        /**
         * @param {Point} other
         * @returns {boolean}
         */
        clockwise(other) {
            return this.x * other.y - this.y * other.x > 0;
        }

        /**
         * @returns {Point}
         */
        getDirection() {
            const d = this.getDistance();
            return this.div(d);
        }

        /**
         * @returns {Point}
         */
        negate() {
            return new Point(-this.x, -this.y);
        }

        /**
         * @param {Point} other
         * @returns {Point}
         */
        minus(other) {
            return new Point(this.x - other.x, this.y - other.y);
        }

        /**
         * @param {Point} other
         * @returns {Point}
         */
        plus(other) {
            return new Point(this.x + other.x, this.y + other.y);
        }

        /**
         * @param {float} operand
         * @returns {Point}
         */
        times(operand) {
            return new Point(this.x * operand, this.y * operand);
        }

        /**
         * @param {float} operand
         * @returns {Point}
         */
        div(operand) {
            return new Point(this.x / operand, this.y / operand);
        }

        /**
         * @param {float} operand
         * @returns {Point}
         */
        rem(operand) {
            return new Point(this.x % operand, this.y % operand);
        }

        /**
         * @param {Point} start
         * @param {Point} stop
         * @param {float} fraction
         * @returns {Point}
         */
        static interpolate(start, stop, fraction) {
            return new Point(
                start.x + (stop.x - start.x) * fraction,
                start.y + (stop.y - start.y) * fraction
            );
        }

        /**
         * @param {function(float, float): Point} f
         * @returns {Point}
         */
        transformed(f) {
            const result = f(this.x, this.y);
            return new Point(result.x, result.y);
        }

        /**
         * @returns {Point}
         */
        rotate90() {
            return new Point(-this.y, this.x);
        }
    }
    return { createPoint, Point };
  },
  "shapes/polygon-measure.js": function (__require) {
    const Cubic = __require("shapes/cubic.js");
    const Point = __require("shapes/point.js");
    const FeatureMapping = __require("shapes/feature-mapping.js");
    const Utils = __require("shapes/utils.js");
    const Feature = __require("shapes/feature.js");
    class MeasuredPolygon {
        constructor(measurer, features, cubics, outlineProgress) {
            this.measurer = measurer
            this.features = features
            this.outlineProgress = outlineProgress
            this.cubics = []

            const measuredCubics = []
            let startOutlineProgress = 0
            for(let i = 0; i < cubics.length; i++) {
                if ((outlineProgress[i + 1] - outlineProgress[i]) > Utils.DistanceEpsilon) {
                    measuredCubics.push(
                        new MeasuredCubic(this, cubics[i], startOutlineProgress, outlineProgress[i + 1])
                    )
                    // The next measured cubic will start exactly where this one ends.
                    startOutlineProgress = outlineProgress[i + 1]
                }
            }

            measuredCubics[measuredCubics.length - 1].updateProgressRange(measuredCubics[measuredCubics.length - 1].startOutlineProgress, 1)
            this.cubics = measuredCubics
        }

        cutAndShift(cuttingPoint) {
            if (cuttingPoint < Utils.DistanceEpsilon) return this

            // Find the index of cubic we want to cut
            const targetIndex = this.cubics.findIndex(it => cuttingPoint >= it.startOutlineProgress && cuttingPoint <= it.endOutlineProgress)
            const target = this.cubics[targetIndex]
            // Cut the target cubic.
            // b1, b2 are two resulting cubics after cut
            const { a: b1, b: b2 } = target.cutAtProgress(cuttingPoint)

            // Construct the list of the cubics we need:
            // * The second part of the target cubic (after the cut)
            // * All cubics after the target, until the end + All cubics from the start, before the
            //   target cubic
            // * The first part of the target cubic (before the cut)
            const retCubics = [b2.cubic]
            for(let i = 1; i < this.cubics.length; i++) {
                retCubics.push(this.cubics[(i + targetIndex) % this.cubics.length].cubic)
            }
            retCubics.push(b1.cubic)

            // Construct the array of outline progress.
            // For example, if we have 3 cubics with outline progress [0 .. 0.3], [0.3 .. 0.8] &
            // [0.8 .. 1.0], and we cut + shift at 0.6:
            // 0.  0123456789
            //     |--|--/-|-|
            // The outline progresses will start at 0 (the cutting point, that shifs to 0.0),
            // then 0.8 - 0.6 = 0.2, then 1 - 0.6 = 0.4, then 0.3 - 0.6 + 1 = 0.7,
            // then 1 (the cutting point again),
            // all together: (0.0, 0.2, 0.4, 0.7, 1.0)
            const retOutlineProgress = []
            for (let i = 0; i < this.cubics.length + 2; i++) {
                if (i === 0) {
                    retOutlineProgress.push(0)
                } else if(i === this.cubics.length + 1) {
                    retOutlineProgress.push(1)
                } else {
                    const cubicIndex = (targetIndex + i - 1) % this.cubics.length
                    retOutlineProgress.push(Utils.positiveModulo(this.cubics[cubicIndex].endOutlineProgress - cuttingPoint, 1))
                }
            }

            // Shift the feature's outline progress too.
            const newFeatures = []
            for(let i = 0; i < this.features.length; i++) {
                newFeatures.push(new FeatureMapping.ProgressableFeature(Utils.positiveModulo(this.features[i].progress - cuttingPoint, 1), this.features[i].feature))
            }

            // Filter out all empty cubics (i.e. start and end anchor are (almost) the same point.)
            return new MeasuredPolygon(this.measurer, newFeatures, retCubics, retOutlineProgress)
        }

        static measurePolygon(measurer, polygon) {
            const cubics = []
            const featureToCubic = []

            for (let featureIndex = 0; featureIndex < polygon.features.length; featureIndex++) {
                const feature = polygon.features[featureIndex]
                for (let cubicIndex = 0; cubicIndex < feature.cubics.length; cubicIndex++) {
                    if (feature instanceof Feature.Corner && cubicIndex == feature.cubics.length / 2) {
                        featureToCubic.push({ a: feature, b: cubics.length })
                    }
                    cubics.push(feature.cubics[cubicIndex])
                }
            }

            const measures = [0] // Initialize with 0 like in Kotlin's scan
            for (const cubic of cubics) {
                const measurement = measurer.measureCubic(cubic)
                if (measurement < 0) {
                    throw new Error("Measured cubic is expected to be greater or equal to zero")
                }
                const lastMeasure = measures[measures.length - 1]
                measures.push(lastMeasure + measurement)
            }
            const totalMeasure = measures[measures.length - 1]

            const outlineProgress = []
            for (let i = 0; i < measures.length; i++) {
                outlineProgress.push(measures[i] / totalMeasure)
            }

            const features = []
            for (let i = 0; i < featureToCubic.length; i++) {
                const ix = featureToCubic[i].b
                features.push(
                    new FeatureMapping.ProgressableFeature(Utils.positiveModulo((outlineProgress[ix] + outlineProgress[ix + 1]) / 2, 1), featureToCubic[i].a))
            }

            return new MeasuredPolygon(measurer, features, cubics, outlineProgress)
        }
    }

    class MeasuredCubic {
        constructor(polygon, cubic, startOutlineProgress, endOutlineProgress) {
            this.polygon = polygon
            this.cubic = cubic
            this.startOutlineProgress = startOutlineProgress
            this.endOutlineProgress = endOutlineProgress
            this.measuredSize = this.polygon.measurer.measureCubic(cubic)
        }

        updateProgressRange(
            startOutlineProgress = this.startOutlineProgress,
            endOutlineProgress = this.endOutlineProgress,
        ) {
            this.startOutlineProgress = startOutlineProgress
            this.endOutlineProgress = endOutlineProgress
        }

        cutAtProgress(cutOutlineProgress) {
            const boundedCutOutlineProgress = Utils.coerceIn(cutOutlineProgress, this.startOutlineProgress, this.endOutlineProgress)
            const outlineProgressSize = this.endOutlineProgress - this.startOutlineProgress
            const progressFromStart = boundedCutOutlineProgress - this.startOutlineProgress

            const relativeProgress = progressFromStart / outlineProgressSize
            const t = this.polygon.measurer.findCubicCutPoint(this.cubic, relativeProgress * this.measuredSize)

            const {a: c1, b: c2} = this.cubic.split(t)
            return { 
                a: new MeasuredCubic(this.polygon, c1, this.startOutlineProgress, boundedCutOutlineProgress), 
                b: new MeasuredCubic(this.polygon, c2, boundedCutOutlineProgress, this.endOutlineProgress) 
            }
        }
    }

    class LengthMeasurer {
        constructor() {
            this.segments = 3
        }

        measureCubic(c) {
            return this.closestProgressTo(c, Number.POSITIVE_INFINITY).y
        }

        findCubicCutPoint(c, m) {
            return this.closestProgressTo(c, m).x
        }

        closestProgressTo(cubic, threshold) {
            let total = 0
            let remainder = threshold
            let prev = new Point.Point(cubic.anchor0X, cubic.anchor0Y)

            for (let i = 1; i < this.segments; i++) {
                const progress = i / this.segments
                const point = cubic.pointOnCurve(progress)
                const segment = point.minus(prev).getDistance()

                if (segment >= remainder) {
                    return new Point.Point(progress - (1.0 - remainder / segment) / this.segments, threshold)
                }

                remainder -= segment
                total += segment
                prev = point
            }

            return new Point.Point(1.0, total)
        }
    }
    return { MeasuredPolygon, MeasuredCubic, LengthMeasurer };
  },
  "shapes/rounded-corner.js": function (__require) {
    const PointModule = __require("shapes/point.js");
    const RoundingModule = __require("shapes/corner-rounding.js");
    const UtilsModule = __require("shapes/utils.js");
    const CubicModule = __require("shapes/cubic.js");
    var Point = PointModule.Point;
    var CornerRounding = RoundingModule.CornerRounding;
    var DistanceEpsilon = UtilsModule.DistanceEpsilon;
    var directionVector = UtilsModule.directionVector;
    var Cubic = CubicModule.Cubic;

    class RoundedCorner {
        /**
         * @param {Point} p0
         * @param {Point} p1
         * @param {Point} p2
         * @param {CornerRounding} [rounding=null]
         */
        constructor(p0, p1, p2, rounding = null) {
            this.p0 = p0;
            this.p1 = p1;
            this.p2 = p2;
            this.rounding = rounding;
            this.center = new Point(0, 0);

            const v01 = p0.minus(p1);
            const v21 = p2.minus(p1);
            const d01 = v01.getDistance();
            const d21 = v21.getDistance();
            
            if (d01 > 0 && d21 > 0) {
                this.d1 = v01.div(d01);
                this.d2 = v21.div(d21);
                this.cornerRadius = rounding?.radius ?? 0;
                this.smoothing = rounding?.smoothing ?? 0;

                // cosine of angle at p1 is dot product of unit vectors to the other two vertices
                this.cosAngle = this.d1.dotProduct(this.d2);

                // identity: sin^2 + cos^2 = 1
                // sinAngle gives us the intersection
                this.sinAngle = Math.sqrt(1 - Math.pow(this.cosAngle, 2));
                
                // How much we need to cut, as measured on a side, to get the required radius
                // calculating where the rounding circle hits the edge
                // This uses the identity of tan(A/2) = sinA/(1 + cosA), where tan(A/2) = radius/cut
                this.expectedRoundCut = this.sinAngle > 1e-3 ? this.cornerRadius * (this.cosAngle + 1) / this.sinAngle : 0;
            } else {
                // One (or both) of the sides is empty, not much we can do.
                this.d1 = new Point(0, 0);
                this.d2 = new Point(0, 0);
                this.cornerRadius = 0;
                this.smoothing = 0;
                this.cosAngle = 0;
                this.sinAngle = 0;
                this.expectedRoundCut = 0;
            }
        }

        get expectedCut() {
            return ((1 + this.smoothing) * this.expectedRoundCut);
        }

        /**
         * @param {float} allowedCut0
         * @param {float} [allowedCut1]
         * @returns {Array<Cubic>}
         */
        getCubics(allowedCut0, allowedCut1 = allowedCut0) {
            // We use the minimum of both cuts to determine the radius, but if there is more space
            // in one side we can use it for smoothing.
            const allowedCut = Math.min(allowedCut0, allowedCut1);
            
            // Nothing to do, just use lines, or a point
            if (
                this.expectedRoundCut < DistanceEpsilon ||
                allowedCut < DistanceEpsilon ||
                this.cornerRadius < DistanceEpsilon
            ) {
                this.center = this.p1;
                return [Cubic.straightLine(this.p1.x, this.p1.y, this.p1.x, this.p1.y)];
            }
            
            // How much of the cut is required for the rounding part.
            const actualRoundCut = Math.min(allowedCut, this.expectedRoundCut);
            
            // We have two smoothing values, one for each side of the vertex
            // Space is used for rounding values first. If there is space left over, then we
            // apply smoothing, if it was requested
            const actualSmoothing0 = this.calculateActualSmoothingValue(allowedCut0);
            const actualSmoothing1 = this.calculateActualSmoothingValue(allowedCut1);
            
            // Scale the radius if needed
            const actualR = this.cornerRadius * actualRoundCut / this.expectedRoundCut;
            
            // Distance from the corner (p1) to the center
            const centerDistance = Math.sqrt(Math.pow(actualR, 2) + Math.pow(actualRoundCut, 2));
            
            // Center of the arc we will use for rounding
            this.center = this.p1.plus(this.d1.plus(this.d2).div(2).getDirection().times(centerDistance));
            
            const circleIntersection0 = this.p1.plus(this.d1.times(actualRoundCut));
            const circleIntersection2 = this.p1.plus(this.d2.times(actualRoundCut));
            
            const flanking0 = this.computeFlankingCurve(
                actualRoundCut,
                actualSmoothing0,
                this.p1,
                this.p0,
                circleIntersection0,
                circleIntersection2,
                this.center,
                actualR
            );
            
            const flanking2 = this.computeFlankingCurve(
                actualRoundCut,
                actualSmoothing1,
                this.p1,
                this.p2,
                circleIntersection2,
                circleIntersection0,
                this.center,
                actualR
            ).reverse();
            
            return [
                flanking0,
                Cubic.circularArc(
                    this.center.x,
                    this.center.y,
                    flanking0.anchor1X,
                    flanking0.anchor1Y,
                    flanking2.anchor0X,
                    flanking2.anchor0Y
                ),
                flanking2
            ];
        }

        /**
         * @private
         * @param {float} allowedCut
         * @returns {float}
         */
        calculateActualSmoothingValue(allowedCut) {
            if (allowedCut > this.expectedCut) {
                return this.smoothing;
            } else if (allowedCut > this.expectedRoundCut) {
                return this.smoothing * (allowedCut - this.expectedRoundCut) / (this.expectedCut - this.expectedRoundCut);
            } else {
                return 0;
            }
        }

        /**
         * @private
         * @param {float} actualRoundCut
         * @param {float} actualSmoothingValues
         * @param {Point} corner
         * @param {Point} sideStart
         * @param {Point} circleSegmentIntersection
         * @param {Point} otherCircleSegmentIntersection
         * @param {Point} circleCenter
         * @param {float} actualR
         * @returns {Cubic}
         */
        computeFlankingCurve(
            actualRoundCut,
            actualSmoothingValues,
            corner,
            sideStart,
            circleSegmentIntersection,
            otherCircleSegmentIntersection,
            circleCenter,
            actualR
        ) {
            // sideStart is the anchor, 'anchor' is actual control point
            const sideDirection = (sideStart.minus(corner)).getDirection();
            const curveStart = corner.plus(sideDirection.times(actualRoundCut * (1 + actualSmoothingValues)));
            
            // We use an approximation to cut a part of the circle section proportional to 1 - smooth,
            // When smooth = 0, we take the full section, when smooth = 1, we take nothing.
            const p = Point.interpolate(
                circleSegmentIntersection,
                (circleSegmentIntersection.plus(otherCircleSegmentIntersection)).div(2),
                actualSmoothingValues
            );
            
            // The flanking curve ends on the circle
            const curveEnd = circleCenter.plus(
                directionVector(p.x - circleCenter.x, p.y - circleCenter.y).times(actualR)
            );
            
            // The anchor on the circle segment side is in the intersection between the tangent to the
            // circle in the circle/flanking curve boundary and the linear segment.
            const circleTangent = (curveEnd.minus(circleCenter)).rotate90();
            const anchorEnd = this.lineIntersection(sideStart, sideDirection, curveEnd, circleTangent) ?? circleSegmentIntersection;
            
            // From what remains, we pick a point for the start anchor.
            // 2/3 seems to come from design tools?
            const anchorStart = (curveStart.plus(anchorEnd.times(2))).div(3);
            
            return Cubic.create(curveStart, anchorStart, anchorEnd, curveEnd);
        }

        /**
         * @private
         * @param {Point} p0
         * @param {Point} d0
         * @param {Point} p1
         * @param {Point} d1
         * @returns {Point|null}
         */
        lineIntersection(p0, d0, p1, d1) {
            const rotatedD1 = d1.rotate90();
            const den = d0.dotProduct(rotatedD1);
            if (Math.abs(den) < DistanceEpsilon) return null;
            
            const num = (p1.minus(p0)).dotProduct(rotatedD1);
            // Also check the relative value. This is equivalent to abs(den/num) < DistanceEpsilon,
            // but avoid doing a division
            if (Math.abs(den) < DistanceEpsilon * Math.abs(num)) return null;
            
            const k = num / den;
            return p0.plus(d0.times(k));
        }
    }
    return { Point, CornerRounding, DistanceEpsilon, directionVector, Cubic, RoundedCorner };
  },
  "shapes/rounded-polygon.js": function (__require) {
    const Feature = __require("shapes/feature.js");
    const Point = __require("shapes/point.js");
    const Cubic = __require("shapes/cubic.js");
    const Utils = __require("shapes/utils.js");
    const CornerRounding = __require("shapes/corner-rounding.js");
    const RoundedCorner = __require("shapes/rounded-corner.js");
    class RoundedPolygon {
        constructor(features, center) {
            this.features = features
            this.center = center
            this.cubics = this.buildCubicList()
        }

        get centerX() {
            return this.center.x
        }

        get centerY() {
            return this.center.y
        }

        transformed(f) {
            const center = this.center.transformed(f)
            return new RoundedPolygon(this.features.map(x => x.transformed(f)), center)
        }

        normalized() {
            const bounds = this.calculateBounds()
            const width = bounds[2] - bounds[0]
            const height = bounds[3] - bounds[1]
            const side = Math.max(width, height)
            // Center the shape if bounds are not a square
            const offsetX = (side - width) / 2 - bounds[0] /* left */
            const offsetY = (side - height) / 2 - bounds[1] /* top */
            return this.transformed((x, y) => {
                return new Point.Point((x + offsetX) / side, (y + offsetY) / side)
            })
        }

        calculateMaxBounds(bounds = []) {
            let maxDistSquared = 0
            for (let i = 0; i < this.cubics.length; i++) {
                const cubic = this.cubics[i]
                const anchorDistance = Utils.distanceSquared(cubic.anchor0X - this.centerX, cubic.anchor0Y - this.centerY)
                const middlePoint = cubic.pointOnCurve(.5)
                const middleDistance = Utils.distanceSquared(middlePoint.x - this.centerX, middlePoint.y - this.centerY)
                maxDistSquared = Math.max(maxDistSquared, Math.max(anchorDistance, middleDistance))
            }
            const distance = Math.sqrt(maxDistSquared)
            bounds[0] = this.centerX - distance
            bounds[1] = this.centerY - distance
            bounds[2] = this.centerX + distance
            bounds[3] = this.centerY + distance
            return bounds
        }

        calculateBounds(bounds = [], approximate = true) {
            let minX = Number.MAX_SAFE_INTEGER
            let minY = Number.MAX_SAFE_INTEGER
            let maxX = Number.MIN_SAFE_INTEGER
            let maxY = Number.MIN_SAFE_INTEGER
            for (let i = 0; i < this.cubics.length; i++) {
                const cubic = this.cubics[i]
                cubic.calculateBounds(bounds, approximate)
                minX = Math.min(minX, bounds[0])
                minY = Math.min(minY, bounds[1])
                maxX = Math.max(maxX, bounds[2])
                maxY = Math.max(maxY, bounds[3])
            }
            bounds[0] = minX
            bounds[1] = minY
            bounds[2] = maxX
            bounds[3] = maxY
            return bounds
        }

        buildCubicList() {
            const result = []

            // The first/last mechanism here ensures that the final anchor point in the shape
            // exactly matches the first anchor point. There can be rendering artifacts introduced
            // by those points being slightly off, even by much less than a pixel
            let firstCubic = null
            let lastCubic = null
            let firstFeatureSplitStart = null
            let firstFeatureSplitEnd = null

            if (this.features.length > 0 && this.features[0].cubics.length == 3) {
                const centerCubic = this.features[0].cubics[1]
                const { a: start, b: end } = centerCubic.split(.5)
                firstFeatureSplitStart = [this.features[0].cubics[0], start]
                firstFeatureSplitEnd = [end, this.features[0].cubics[2]]
            }

            // iterating one past the features list size allows us to insert the initial split
            // cubic if it exists
            for (let i = 0; i <= this.features.length; i++) {
                let featureCubics
                if (i == 0 && firstFeatureSplitEnd != null) {
                    featureCubics = firstFeatureSplitEnd
                } else if (i == this.features.length) {
                    if (firstFeatureSplitStart != null) {
                        featureCubics = firstFeatureSplitStart
                    } else {
                        break
                    }
                } else {
                    featureCubics = this.features[i].cubics
                }

                for (let j = 0; j < featureCubics.length; j++) {
                    // Skip zero-length curves; they add nothing and can trigger rendering artifacts
                    const cubic = featureCubics[j]
                    if (!cubic.zeroLength()) {
                        if (lastCubic != null)
                            result.push(lastCubic)
                        lastCubic = cubic
                        if (firstCubic == null)
                            firstCubic = cubic
                    } else {
                        if (lastCubic != null) {
                            // Dropping several zero-ish length curves in a row can lead to
                            // enough discontinuity to throw an exception later, even though the
                            // distances are quite small. Account for that by making the last
                            // cubic use the latest anchor point, always.
                            lastCubic = new Cubic.Cubic([...lastCubic.points]) // Make a copy before mutating
                            lastCubic.points[6] = cubic.anchor1X
                            lastCubic.points[7] = cubic.anchor1Y
                        }
                    }
                }
            }
            if (lastCubic != null && firstCubic != null) {
                result.push(
                    new Cubic.Cubic([
                        lastCubic.anchor0X,
                        lastCubic.anchor0Y,
                        lastCubic.control0X,
                        lastCubic.control0Y,
                        lastCubic.control1X,
                        lastCubic.control1Y,
                        firstCubic.anchor0X,
                        firstCubic.anchor0Y,
                    ])
                )
            } else {
                // Empty / 0-sized polygon.
                result.push(new Cubic.Cubic([this.centerX, this.centerY, this.centerX, this.centerY, this.centerX, this.centerY, this.centerX, this.centerY]))
            }

            return result
        }

        static calculateCenter(vertices) {
            let cumulativeX = 0
            let cumulativeY = 0
            let index = 0
            while (index < vertices.length) {
                cumulativeX += vertices[index++]
                cumulativeY += vertices[index++]
            }
            return new Point.Point(cumulativeX / (vertices.length / 2), cumulativeY / (vertices.length / 2))
        }

        static verticesFromNumVerts(numVertices, radius, centerX, centerY) {
            const result = []
            let arrayIndex = 0
            for (let i = 0; i < numVertices; i++) {
                const vertex = Utils.radialToCartesian(radius, (Math.PI / numVertices * 2 * i)).plus(new Point.Point(centerX, centerY))
                result[arrayIndex++] = vertex.x
                result[arrayIndex++] = vertex.y
            }
            return result
        }

        static fromNumVertices(numVertices, radius = 1, centerX = 0, centerY = 0, rounding = CornerRounding.Unrounded, perVertexRounding = null) {
            return RoundedPolygon.fromVertices(this.verticesFromNumVerts(numVertices, radius, centerX, centerY), rounding, perVertexRounding, centerX, centerY)
        }

        static fromVertices(vertices, rounding = CornerRounding.Unrounded, perVertexRounding = null, centerX = Number.MIN_SAFE_INTEGER, centerY = Number.MAX_SAFE_INTEGER) {
            const corners = []
            const n = vertices.length / 2
            const roundedCorners = []
            for (let i = 0; i < n; i++) {
                const vtxRounding = perVertexRounding?.[i] ?? rounding
                const prevIndex = ((i + n - 1) % n) * 2
                const nextIndex = ((i + 1) % n) * 2
                roundedCorners.push(
                    new RoundedCorner.RoundedCorner(
                        new Point.Point(vertices[prevIndex], vertices[prevIndex + 1]),
                        new Point.Point(vertices[i * 2], vertices[i * 2 + 1]),
                        new Point.Point(vertices[nextIndex], vertices[nextIndex + 1]),
                        vtxRounding
                    )
                )
            }

            // For each side, check if we have enough space to do the cuts needed, and if not split
            // the available space, first for round cuts, then for smoothing if there is space left.
            // Each element in this list is a pair, that represent how much we can do of the cut for
            // the given side (side i goes from corner i to corner i+1), the elements of the pair are:
            // first is how much we can use of expectedRoundCut, second how much of expectedCut
            const cutAdjusts = Array.from({ length: n }).map((_, ix) => {
                const expectedRoundCut = roundedCorners[ix].expectedRoundCut + roundedCorners[(ix + 1) % n].expectedRoundCut
                const expectedCut = roundedCorners[ix].expectedCut + roundedCorners[(ix + 1) % n].expectedCut
                const vtxX = vertices[ix * 2]
                const vtxY = vertices[ix * 2 + 1]
                const nextVtxX = vertices[((ix + 1) % n) * 2]
                const nextVtxY = vertices[((ix + 1) % n) * 2 + 1]
                const sideSize = Utils.distance(vtxX - nextVtxX, vtxY - nextVtxY)

                // Check expectedRoundCut first, and ensure we fulfill rounding needs first for
                // both corners before using space for smoothing
                if (expectedRoundCut > sideSize) {
                    // Not enough room for fully rounding, see how much we can actually do.
                    return { a: sideSize / expectedRoundCut, b: 0 }
                } else if (expectedCut > sideSize) {
                    // We can do full rounding, but not full smoothing.
                    return { a: 1, b: (sideSize - expectedRoundCut) / (expectedCut - expectedRoundCut) }
                } else {
                    // There is enough room for rounding & smoothing.
                    return { a: 1, b: 1 }
                }
            })

            // Create and store list of beziers for each [potentially] rounded corner
            for (let i = 0; i < n; i++) {
                // allowedCuts[0] is for the side from the previous corner to this one,
                // allowedCuts[1] is for the side from this corner to the next one.
                const allowedCuts = []
                for(const delta of [0, 1]) {
                    const { a: roundCutRatio, b: cutRatio } = cutAdjusts[(i + n - 1 + delta) % n]
                    allowedCuts.push(
                        roundedCorners[i].expectedRoundCut * roundCutRatio +
                        (roundedCorners[i].expectedCut - roundedCorners[i].expectedRoundCut) * cutRatio
                    )
                }
                corners.push(
                    roundedCorners[i].getCubics(allowedCuts[0], allowedCuts[1])
                )
            }

            const tempFeatures = []
            for (let i = 0; i < n; i++) {
                // Note that these indices are for pairs of values (points), they need to be
                // doubled to access the xy values in the vertices float array
                const prevVtxIndex = (i + n - 1) % n
                const nextVtxIndex = (i + 1) % n
                const currVertex = new Point.Point(vertices[i * 2], vertices[i * 2 + 1])
                const prevVertex = new Point.Point(vertices[prevVtxIndex * 2], vertices[prevVtxIndex * 2 + 1])
                const nextVertex = new Point.Point(vertices[nextVtxIndex * 2], vertices[nextVtxIndex * 2 + 1])
                const cnvx = Utils.convex(prevVertex, currVertex, nextVertex)
                tempFeatures.push(new Feature.Corner(corners[i], cnvx))
                tempFeatures.push(
                    new Feature.Edge([Cubic.Cubic.straightLine(
                        corners[i][corners[i].length - 1].anchor1X,
                        corners[i][corners[i].length - 1].anchor1Y,
                        corners[(i + 1) % n][0].anchor0X,
                        corners[(i + 1) % n][0].anchor0Y,
                    )])
                )
            }

            let center
            if (centerX == Number.MIN_SAFE_INTEGER || centerY == Number.MIN_SAFE_INTEGER) {
                center = RoundedPolygon.calculateCenter(vertices)
            } else {
                center = new Point.Point(centerX, centerY)
            }

            return RoundedPolygon.fromFeatures(tempFeatures, center.x, center.y)
        }

        static fromFeatures(features, centerX, centerY) {
            const vertices = []
            for (const feature of features) {
                for (const cubic of feature.cubics) {
                    vertices.push(cubic.anchor0X)
                    vertices.push(cubic.anchor0Y)
                }
            }

            if (Number.isNaN(centerX)) {
                centerX = this.calculateCenter(vertices).x
            }
            if (Number.isNaN(centerY)) {
                centerY = this.calculateCenter(vertices).y
            }

            return new RoundedPolygon(features, new Point.Point(centerX, centerY))
        }

        static circle(numVertices = 8, radius = 1, centerX = 0, centerY = 0) {
            // Half of the angle between two adjacent vertices on the polygon
            const theta = Math.PI / numVertices
            // Radius of the underlying RoundedPolygon object given the desired radius of the circle
            const polygonRadius = radius / Math.cos(theta)
            return RoundedPolygon.fromNumVertices(
                numVertices,
                polygonRadius,
                centerX,
                centerY,
                new CornerRounding.CornerRounding(radius)
            )
        }

        static rectangle(width, height, rounding = CornerRounding.Unrounded, perVertexRounding = null, centerX = 0, centerY = 0) {
            const left = centerX - width / 2
            const top = centerY - height / 2
            const right = centerX + width / 2
            const bottom = centerY + height / 2

            return RoundedPolygon.fromVertices([right, bottom, left, bottom, left, top, right, top], rounding, perVertexRounding, centerX, centerY)
        }

        static star(numVerticesPerRadius, radius = 1, innerRadius = .5, rounding = CornerRounding.Unrounded, innerRounding = null, perVertexRounding = null, centerX = 0, centerY = 0) {
            let pvRounding = perVertexRounding
            // If no per-vertex rounding supplied and caller asked for inner rounding,
            // create per-vertex rounding list based on supplied outer/inner rounding parameters
            if (pvRounding == null && innerRounding != null) {
                pvRounding = Array.from({ length: numVerticesPerRadius * 2 }).flatMap(() => [rounding, innerRounding])
            }

            return RoundedPolygon.fromVertices(RoundedPolygon.starVerticesFromNumVerts(numVerticesPerRadius, radius, innerRadius, centerX, centerY), rounding, perVertexRounding, centerX, centerY)
        }

        static starVerticesFromNumVerts(numVerticesPerRadius, radius, innerRadius, centerX, centerY) {
            const result = []
            let arrayIndex = 0
            for (let i = 0; i < numVerticesPerRadius; i++) {
                let vertex = Utils.radialToCartesian(radius, (Math.PI / numVerticesPerRadius * 2 * i))
                result[arrayIndex++] = vertex.x + centerX
                result[arrayIndex++] = vertex.y + centerY
                vertex = Utils.radialToCartesian(innerRadius, (Math.PI / numVerticesPerRadius * (2 * i + 1)))
                result[arrayIndex++] = vertex.x + centerX
                result[arrayIndex++] = vertex.y + centerY
            }
            return result
        }
    }
    return { RoundedPolygon };
  },
  "shapes/utils.js": function (__require) {
    const PointModule = __require("shapes/point.js");
    var Point = PointModule.Point;
    var DistanceEpsilon = 1e-4;
    var AngleEpsilon = 1e-6;

    /**
     * @param {Point} previous
     * @param {Point} current
     * @param {Point} next
     * @returns {boolean}
     */
    function convex(previous, current, next) {
        return (current.minus(previous)).clockwise(next.minus(current));
    }

    /**
     * @param {float} start
     * @param {float} stop
     * @param {float} fraction
     * @returns {float}
     */
    function interpolate(start, stop, fraction) {
        return (1 - fraction) * start + fraction * stop;
    }

    /**
     * @param {float} x
     * @param {float} y
     * @returns {Point}
     */
    function directionVector(x, y) {
        const d = distance(x, y);
        return new Point(x / d, y / d);
    }

    /**
     * @param {float} x
     * @param {float} y
     * @returns {float}
     */
    function distance(x, y) {
        return Math.sqrt(x * x + y * y);
    }

    /**
     * @param {float} x
     * @param {float} y
     * @returns {float}
     */
    function distanceSquared(x, y) {
        return x * x + y * y;
    }

    /**
     * @param {float} radius
     * @param {float} angleRadians
     * @param {Point} [center]
     * @returns {Point}
     */
    function radialToCartesian(radius, angleRadians, center = new Point(0, 0)) {
        return new Point(Math.cos(angleRadians), Math.sin(angleRadians))
            .times(radius)
            .plus(center);
    }

    /**
     * @param {float} value
     * @param {float|object} min
     * @param {float} [max]
     * @returns {float}
     */
    function coerceIn(value, min, max) {
        if (max === undefined) {
            if (typeof min === 'object' && 'start' in min && 'endInclusive' in min) {
                return Math.max(min.start, Math.min(min.endInclusive, value));
            }
            throw new Error("Invalid arguments for coerceIn");
        }

        const [actualMin, actualMax] = min <= max ? [min, max] : [max, min];
        return Math.max(actualMin, Math.min(actualMax, value));
    }

    /**
     * @param {float} value
     * @param {float} mod
     * @returns {float}
     */
    function positiveModulo(value, mod) {
        return ((value % mod) + mod) % mod;
    }
    return { Point, DistanceEpsilon, AngleEpsilon, convex, interpolate, directionVector, distance, distanceSquared, radialToCartesian, coerceIn, positiveModulo };
  }
  };
  const __cache = {};
  function __require(key) {
    if (!(key in __cache)) {
      if (!__factories[key]) throw new Error('m3-shapes: no module ' + key);
      __cache[key] = {};
      __cache[key] = __factories[key](__require);
    }
    return __cache[key];
  }

  // ---- M3Shapes: the public API (new; everything above is the library) ----

  const MaterialShapes = __require('material-shapes.js');
  const RoundedPolygon = __require('shapes/rounded-polygon.js').RoundedPolygon;
  const CornerRounding = __require('shapes/corner-rounding.js').CornerRounding;
  const Morph = __require('shapes/morph.js').Morph;

  // Swiftify's names for Material's 35 shapes, in its order
  const GETTERS = {
    circle: 'getCircle', square: 'getSquare', slanted: 'getSlanted', arch: 'getArch', fan: 'getFan',
    arrow: 'getArrow', semiCircle: 'getSemiCircle', oval: 'getOval', pill: 'getPill',
    triangle: 'getTriangle', diamond: 'getDiamond', clamShell: 'getClamShell', pentagon: 'getPentagon',
    gem: 'getGem', sunny: 'getSunny', verySunny: 'getVerySunny', cookie4: 'getCookie4Sided',
    cookie6: 'getCookie6Sided', cookie7: 'getCookie7Sided', cookie9: 'getCookie9Sided',
    cookie12: 'getCookie12Sided', ghostish: 'getGhostish', clover4: 'getClover4Leaf',
    clover8: 'getClover8Leaf', burst: 'getBurst', softBurst: 'getSoftBurst', boom: 'getBoom',
    softBoom: 'getSoftBoom', flower: 'getFlower', puffy: 'getPuffy', puffyDiamond: 'getPuffyDiamond',
    pixelCircle: 'getPixelCircle', pixelTriangle: 'getPixelTriangle', bun: 'getBun', heart: 'getHeart',
  };

  // Swiftify's own two shapes. It draws them from a polar formula; here they are
  // rounded polygons like the rest, so they morph to and from any other shape.
  const CUSTOM = {
    // a paused play button: fewer bumps than a cookie, and gentler ones
    softCookie: () => RoundedPolygon.star(5, 1, 0.86, new CornerRounding(0.6)).normalized(),
    squircle: () => RoundedPolygon.rectangle(1, 1, new CornerRounding(0.42, 1)).normalized(),
  };

  const names = Object.keys(GETTERS).concat(Object.keys(CUSTOM));
  const polygons = {};
  const morphs = {};

  function polygon(name) {
    if (!polygons[name]) {
      if (GETTERS[name]) polygons[name] = MaterialShapes[GETTERS[name]]();
      else if (CUSTOM[name]) polygons[name] = CUSTOM[name]();
      else throw new Error('M3Shapes: unknown shape "' + name + '"');
    }
    return polygons[name];
  }

  function n(value, size) {
    return (Math.round(value * size * 100) / 100).toString();
  }

  function cubicsToPath(cubics, size) {
    let d = '';
    for (let i = 0; i < cubics.length; i++) {
      const p = cubics[i].points;
      if (i === 0) d += 'M' + n(p[0], size) + ' ' + n(p[1], size);
      d += 'C' + n(p[2], size) + ' ' + n(p[3], size) + ' ' + n(p[4], size) + ' ' + n(p[5], size) +
        ' ' + n(p[6], size) + ' ' + n(p[7], size);
    }
    return d + 'Z';
  }

  /** SVG path data for a shape, fitted to a size x size box (default 100). */
  function path(name, size) {
    return cubicsToPath(polygon(name).cubics, size || 100);
  }

  /**
   * SVG path data partway between two shapes. progress runs 0 (from) to 1 (to);
   * values past either end overshoot, which is what a spring does.
   */
  function morphPath(from, to, progress, size) {
    if (from === to) return path(from, size);
    const key = from + '>' + to;
    if (!morphs[key]) morphs[key] = new Morph(polygon(from), polygon(to));
    return cubicsToPath(morphs[key].asCubics(progress), size || 100);
  }

  global.M3Shapes = { names, polygon, path, morphPath };
})(typeof window !== 'undefined' ? window : globalThis);
