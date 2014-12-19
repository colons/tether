document.body.classList.add('js');

var DEBUG = (window.location.hash === '#DEBUG'),
    INFO = (DEBUG || window.location.hash === '#INFO'),
    game,
    music,
    canvas,
    ctx,
    devicePixelRatio = window.devicePixelRatio || 1,
    width,
    height,
    maximumPossibleDistanceBetweenTwoMasses,
    cookieSuffix = '; max-age=' + (60*60*24*365).toString(),
    highScore = 0,
    highScoreCookieKey = 'tetherHighScore';


/* UTILITIES */
function extend(base, sub) {
  // http://stackoverflow.com/a/4389429
  sub.prototype = Object.create(base.prototype);
  sub.prototype.constructor = sub;
  Object.defineProperty(sub.prototype, 'constructor', {
    enumerable: false,
    value: sub
  });
}

function choice(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function somewhereInTheViewport() {
  return {
    x: Math.random() * width,
    y: Math.random() * height
  };
}

function somewhereJustOutsideTheViewport(buffer) {
  var somewhere = somewhereInTheViewport();
  var edgeSeed = Math.random();

  if (edgeSeed < 0.25) somewhere.x = -buffer;
  else if (edgeSeed < 0.5) somewhere.x = width + buffer;
  else if (edgeSeed < 0.75) somewhere.y = -buffer;
  else somewhere.y = height + buffer;

  return somewhere;
}

function getAttributeFromAllObjs(objs, attr) {
  var attrs = [];
  for (var i = 0; i < objs.length; i++) {
    attrs.push(objs[i][attr]);
  }
  return attrs;
}

function forXAndY(objs, func) {
  return {
    x: func.apply(null, getAttributeFromAllObjs(objs, 'x')),
    y: func.apply(null, getAttributeFromAllObjs(objs, 'y'))
  };
}

// What follows are a bunch of completely contextless calculations that we
// define here because it's grossly inefficient to define them where they
// semantically make sense. For some indication of what they're for, see where
// they're used.
forXAndY.aPlusHalfB = function(a, b) {return a + (b * 5);};
forXAndY.aPlusBTimesSpeed = function(a, b) {return a + (b * game.timeDelta);};
forXAndY.subtract = function(a, b) {return a - b;};
forXAndY.invSubtract = function(a, b) {return b - a;};
forXAndY.add = function() {
  var s = 0;
  for (var i = 0; i < arguments.length; i++) s += arguments[i];
  return s;
};
forXAndY.multiply = function() {
  var p = 1;
  for (var i = 0; i < arguments.length; i++) p *= arguments[i];
  return p;
};

function randomisedVector(vector, potentialMagnitude) {
  var angle = Math.random() * Math.PI * 2;
  var magnitude = Math.random() * potentialMagnitude;
  return forXAndY([vector, vectorAt(angle, magnitude)], forXAndY.add);
}

function getIntersection(line1, line2) {
  var denominator, a, b, numerator1, numerator2, result = {
    x: null,
    y: null,
    onLine1: false,
    onLine2: false
  };

  denominator =
    ((line2[1].y - line2[0].y) * (line1[1].x - line1[0].x)) -
    ((line2[1].x - line2[0].x) * (line1[1].y - line1[0].y));

  if (denominator === 0) {
    return result;
  }

  a = line1[0].y - line2[0].y;
  b = line1[0].x - line2[0].x;
  numerator1 = ((line2[1].x - line2[0].x) * a) - ((line2[1].y - line2[0].y) * b);
  numerator2 = ((line1[1].x - line1[0].x) * a) - ((line1[1].y - line1[0].y) * b);
  a = numerator1 / denominator;
  b = numerator2 / denominator;

  result.x = line1[0].x + (a * (line1[1].x - line1[0].x));
  result.y = line1[0].y + (a * (line1[1].y - line1[0].y));

  if (a > 0 && a < 1) {
    result.onLine1 = true;
  }
  if (b > 0 && b < 1) {
    result.onLine2 = true;
  }
  return result;
}

function pointInPolygon(point, polygon) {
  // http://www.webmasterworld.com/javascript/3551991.htm
  var i, j;
  var c = 0;
  var numberOfPoints = polygon.length;
  for (i = 0, j = numberOfPoints-1; i < numberOfPoints; j = i++) {
    if (
      (((polygon[i].y <= point.y) && (point.y < polygon[j].y)) || ((polygon[j].y <= point.y) && (point.y < polygon[i].y))) &&
      (point.x < (polygon[j].x - polygon[i].x) * (point.y - polygon[i].y) / (polygon[j].y - polygon[i].y) + polygon[i].x)
    ) {
      c =!c;
    }
  }

  return c;
}

function vectorMagnitude(vector) {
  return Math.abs(Math.pow(Math.pow(vector.x, 2) + Math.pow(vector.y, 2), 1/2));
}

function vectorAngle(vector) {
  theta = Math.atan(vector.y/vector.x);
  if (vector.x < 0) theta += Math.PI;
  return theta;
}

function vectorAt(angle, magnitude) {
  return {
    x: Math.cos(angle) * magnitude,
    y: Math.sin(angle) * magnitude
  };
}

// Return a vector with the same angle but with inverse magnitude as the vector
// handed in.
function inverseVector(vector) {
  var angle = vectorAngle(vector);
  var mag = vectorMagnitude(vector);
  return vectorAt(angle, 1/mag);
}

function linesFromPolygon(polygon) {
  // take a list of points [a, b, c, d] and convert it to a list of lines [[a, b], [b, c], [c, d]].
  var polyLine = [];
  for (var i = 1; i < polygon.length; i++) {
    polyLine.push([polygon[i - 1], polygon[i]]);
  }
  return polyLine;
}

function lineAngle(line) {
  return vectorAngle({
    x: line[1].x - line[0].x,
    y: line[1].y - line[0].y
  });
}

function lineDelta(line) {
  return forXAndY(line, forXAndY.invSubtract);
}

function rgbWithOpacity(rgb, opacity) {
  var rgbStrings = [];
  for (var i = 0; i < rgb.length; rgbStrings.push(rgb[i++].toFixed(0)));
  return 'rgba(' + rgbStrings.join(',') + ',' + opacity.toFixed(2) + ')';
}

/* DRAWING */
function draw(opts) {
  for (var defaultKey in draw.defaults) {
    if (!(defaultKey in opts)) opts[defaultKey] = draw.defaults[defaultKey];
  }

  if (DEBUG) {
    for (var key in opts) {
      if (!(key in draw.defaults)) throw(key + ' is not a valid option to draw()');
    }
  }

  ctx.fillStyle = opts.fillStyle;
  ctx.strokeStyle = opts.strokeStyle;
  ctx.lineWidth = opts.lineWidth;

  ctx.beginPath();

  if (opts.type === 'arc') draw.arc(opts);
  else if (opts.type === 'line') draw.line(opts);
  else if (opts.type === 'text') draw.text(opts);
  else if (opts.type === 'rect') draw.rect(opts);
  else if (opts.type === 'clear') draw.clear(opts);
  else throw(opts.type + ' is not an implemented draw type');

  if (opts.fill) ctx.fill();
  if (opts.stroke) ctx.stroke();
}

draw.defaults = {
  type: null,  // 'arc', 'line', 'rect' or 'text'
  fill: false,
  stroke: false,

  // linePaths should be an array of arrays of positions. If you're gonna draw
  // a bunch of similarly-styled lines at once, it's better to only draw once.
  linePaths: [],

  arcCenter: undefined,  // position
  arcRadius: 0,
  arcStart: 0,
  arcFinish: 2 * Math.PI,

  text: '',
  textPosition: undefined,  // position
  fontFamily: 'Tulpen One',
  fontFallback: 'sans-serif',
  textAlign: 'center',
  textBaseline: 'middle',
  fontSize: 20,

  rectBounds: [],

  lineWidth: 1,
  fillStyle: '#000',
  strokeStyle: '#000'
};

draw.arc = function(opts) {
  ctx.arc(opts.arcCenter.x, opts.arcCenter.y, opts.arcRadius, opts.arcStart, opts.arcFinish);
};

draw.line = function(opts) {
  for (var ipath = 0; ipath < opts.linePaths.length; ipath++) {
    var path = opts.linePaths[ipath];

    ctx.moveTo(path[0].x, path[0].y);

    for (var ipos = 1; ipos < path.length; ipos++) {
      var position = path[ipos];
      ctx.lineTo(position.x, position.y);
    }
  }
};

draw.rect = function(opts) {
  ctx.fillRect.apply(ctx, opts.rectBounds);
};

draw.text = function(opts) {
  ctx.font = opts.fontSize.toString() + 'px "' + opts.fontFamily + '", ' + opts.fontFallback;
  ctx.textAlign = opts.textAlign;
  ctx.textBaseline = opts.textBaseline;

  ctx.fillText(opts.text, opts.textPosition.x, opts.textPosition.y);
};

draw.clear = function() {
  ctx.clearRect(0, 0, width, height);
};

/* SETUP */
function scaleCanvas(ratio) {
  canvas.width = width * ratio;
  canvas.height = height * ratio;

  ctx.scale(ratio, ratio);
}

function initCanvas() {
  width = window.innerWidth;
  height = window.innerHeight;

  maximumPossibleDistanceBetweenTwoMasses = vectorMagnitude({x: width, y: height});

  canvas = document.getElementById('game');
  ctx = canvas.getContext('2d');

  canvas.style.width = width.toString() + 'px';
  canvas.style.height = height.toString() + 'px';

  scaleCanvas(devicePixelRatio);
}

function edgesOfCanvas() {
  return linesFromPolygon([
    {x: 0, y: 0},
    {x:0, y: height},
    {x: width, y: height},
    {x: width, y: 0},
    {x: 0, y: 0}
  ]);
}

initCanvas();


function Music() {
  var path;

  if (INFO) path = 'test.mp3';
  else path = 'bgm.mp3';

  var element = new Audio(path);

  if (typeof element.loop === 'boolean') {
    if (INFO) console.log('using element.loop for looping');
    element.loop = true;
  } else {
    if (INFO) console.log('using event listener for looping');
    element.addEventListener('ended', function() {
      element.currentTime = 0;
      element.play();
    });
  }

  element.play();

  this.element = element;
  this.timeSignature = 4;
}
Music.prototype = {
  bpm: 90,
  url: 'bgm.mp3',
  delayCompensation: 0.03,

  totalBeat: function() {
    return ((this.element.currentTime + this.delayCompensation)/60) * this.bpm;
  },

  measure: function() {
    return this.totalBeat() / this.timeSignature;
  },

  beat: function() {
      return (music.totalBeat() % this.timeSignature);
  },

  timeSinceBeat: function() {
    return this.beat() % 1;
  }
};


/* GAME OBJECTS */
// The basic object of our physics engine. A circle with mass, position, velocity and forces.
function Mass() {
  this.seed = Math.random();
}
Mass.prototype = {
  position: {x: 0, y: 0},
  positionOnPreviousFrame: {x: 0, y: 0},
  velocity: {x: 0, y: 0},
  force: {x: 0, y: 0},
  mass: 1,
  lubricant: 1,
  radius: 0,
  visibleRadius: null,
  dashInterval: 1/8,
  extant: true,
  walls: false,
  bounciness: 0,
  rgb: [60,60,60],
  reactsToForce: true,

  journeySincePreviousFrame: function() {
    return [this.positionOnPreviousFrame, this.position];
  },

  bounceInDimension: function(d, max) {
    var distanceFromFarEdge = max - this.radius - this.position[d];
    var distanceFromNearEdge = this.position[d] - this.radius;

    if (distanceFromNearEdge < 0) {
      this.velocity[d] *= -this.bounciness;
      this.position[d] = (distanceFromNearEdge * this.bounciness) + this.radius;
      this.bounceCallback();
    } else if (distanceFromFarEdge < 0) {
      this.velocity[d] *= -this.bounciness;
      this.position[d] = max - (distanceFromFarEdge * this.bounciness) - this.radius;
      this.bounceCallback();
    }
  },

  bounceCallback: function() {},

  collideWithWalls: function () {
    if (!this.walls) return;
    this.bounceInDimension('x', width);
    this.bounceInDimension('y', height);
  },

  setPosition: function(position) {
    this.positionOnPreviousFrame = this.position;
    this.position = position;
  },

  teleportTo: function(position) {
    // like setPosition, but doesn't leave a trace of a journey.
    this.positionOnPreviousFrame = position;
    this.position = position;
  },

  reactToVelocity: function() {
    // set position based on velocity
    this.setPosition(forXAndY([this.position, this.velocity], forXAndY.aPlusBTimesSpeed));
    this.collideWithWalls();
  },

  velocityDelta: function() {
    var self = this;
    return forXAndY([this.force], function(force) {
      return (force / self.mass);
    });
  },

  reactToForce: function() {
    // set velocity and position based on force
    var self = this;
    var projectedVelocity = forXAndY([this.velocity, this.velocityDelta()], forXAndY.aPlusBTimesSpeed);

    this.velocity = forXAndY([projectedVelocity], function(projected) {
      return projected * Math.pow(self.lubricant, game.timeDelta);
    });

    this.reactToVelocity();
  },

  step: function() {
    if (this.reactsToForce) this.reactToForce();
  },

  getOpacity: function() {
    var opacity;
    if (!this.died) opacity = 1;
    else opacity = 1 / Math.max(1, (game.timeElapsed - this.died));

    if (!this.extant && !this.died) opacity *= 0.1;

    return opacity;
  },

  getCurrentColor: function() {
    return rgbWithOpacity(this.rgb, this.getOpacity());
  },

  draw: function() {
    var radius = this.radius;
    if (this.visibleRadius !== null) radius = this.visibleRadius;

    draw({
      type: 'arc',
      arcRadius: radius,
      arcCenter: this.position,
      fillStyle: this.getCurrentColor(),
      fill: true
    });
  },

  drawDottedOutline: function() {
    for (var i = 0; i < 1; i += this.dashInterval) {
      var startAngle = (game.timeElapsed/100) + (i * Math.PI*2);
      draw({
        type: 'arc',
        stroke: true,
        strokeStyle: this.getCurrentColor(),
        arcCenter: this.position,
        arcStart: startAngle,
        arcFinish: startAngle + (Math.PI * this.dashInterval * 0.7),
        arcRadius: this.radius
      });
    }
  },

  explode: function() {
    for (i = 0; i < 50; i++) {
      var angle = Math.random() * Math.PI * 2;
      var magnitude = Math.random() * 40;
      var velocity = forXAndY([vectorAt(angle, magnitude), this.velocity], forXAndY.add);
      (new FireParticle(this.position, velocity));
    }
  },

  focusSegment: function(offset) {
    var baseAngle = (game.timeElapsed / 30) + Math.cos(game.timeElapsed / 10) * 0.2;

    draw({
      type: 'arc',
      stroke: true,
      arcCenter: this.position,
      arcStart: baseAngle + offset,
      arcFinish: baseAngle + Math.PI * 0.5 + offset,
      arcRadius: 40 + Math.sin(game.timeElapsed / 10) * 10,
      strokeStyle: rgbWithOpacity([0,0,0], 0.6)
    });
  },

  focus: function() {
    this.focusSegment(0);
    this.focusSegment(Math.PI);
  }
};


// Aesthetic garbage
function BackgroundPart(i) {
  Mass.call(this);
  this.baseRadius = 2 * Math.max(width, height) / i;
  this.radius = 1;
  this.bounciness = 1;
  this.velocity = vectorAt(Math.PI * 2 * Math.random(), i * Math.random());
  this.teleportTo(somewhereInTheViewport());
  this.walls = true;
  this.color = rgbWithOpacity([127,127,127], 0.005 * i);
}
extend(Mass, BackgroundPart);
BackgroundPart.prototype.getCurrentColor = function() {
  return this.color;
};
BackgroundPart.prototype.step = function() {
  this.visibleRadius = 1/music.timeSinceBeat() * 20 + this.baseRadius;
  Mass.prototype.step.call(this);
};

function Background() {
  this.parts = [];
  for (var i = 0; i < 10; i++) {
    this.parts.push(new BackgroundPart(i));
  }
}
Background.prototype.draw = function() {
  for (var i = 0; i < this.parts.length; this.parts[i++].draw());
};
Background.prototype.step = function() {
  for (var i = 0; i < this.parts.length; this.parts[i++].step());
};


// The thing the player is attached to.
function Tether() {
  Mass.call(this);
  this.radius = 5;

  this.locked = true;
  this.unlockable = true;
  this.rgb = [20,20,200];

  this.teleportTo({
    x: width / 2,
    y: (height / 3) * 2
  });

  this.lastMousePosition = {x: NaN, y: NaN};
  this.lastInteraction = null;
  this.pointsScoredSinceLastInteraction = 0;

  var self = this;

  document.addEventListener('mousemove', function(e) {
    self.lastInteraction = 'mouse';
    if (e.target === canvas) {
      self.lastMousePosition = {x: e.layerX, y: e.layerY};
    }
  });

  document.addEventListener('touchend', function(e) {
    self.locked = true;
    self.lastMousePosition = {x: NaN, y: NaN};
  });

  function handleTouch(e) {
    e.preventDefault();
    self.lastInteraction = 'touch';
    touch = e.changedTouches[0];
    self.lastMousePosition = {x: touch.pageX, y: touch.pageY};
  }

  document.addEventListener('touchstart', handleTouch);
  document.addEventListener('touchmove', handleTouch);

  return this;
}
extend(Mass, Tether);

Tether.prototype.setPosition = function(position) {
  Mass.prototype.setPosition.call(this, position);
  if (this.position !== this.positionOnPreviousFrame) {
    this.pointsScoredSinceLastInteraction = 0;
  }
};

Tether.prototype.step = function() {
  var leniency;
  if (this.lastInteraction === 'touch') leniency = 50;
  else leniency = 30;

  if (this.unlockable && (vectorMagnitude(forXAndY([this.position, this.lastMousePosition], forXAndY.subtract)) < leniency)) {
    this.locked = false;

    if (!game.started) {
      game.start();
    }
  }

  if (!this.locked) {
    this.setPosition(this.lastMousePosition);
  } else {
    this.setPosition(this.position);
  }

};

Tether.prototype.draw = function() {
  if (this.locked && this.unlockable) this.focus();
  Mass.prototype.draw.call(this);
};


// The player. A weight on the end of a bungee cord.
function Player(tether) {
  Mass.call(this);
  this.mass = 50;
  this.onceGameHasStartedLubricant = 0.99;
  this.lubricant = 1;
  this.radius = 10;
  this.walls = true;
  this.teleportTo({
    x: Math.min((width / 10) * 9, (width / 2) + 200),
    y: 5 * (height / 9)
  });
  this.velocity = {x: 0, y: -height/80};
  this.bounciness = 0.4;

  this.tether = tether;
  this.rgb = [20,20,200];
}
extend(Mass, Player);

Player.prototype.step = function() {
  this.force = forXAndY([this.tether.position, this.position], forXAndY.subtract);
  Mass.prototype.step.call(this);
};


// The cable connecting Player to Tether.
function Cable(tether, player) {
  var self = this;

  self.areaCoveredThisStep = function() {
    return [
      tether.positionOnPreviousFrame,
      player.positionOnPreviousFrame,
      player.position,
      tether.position
    ];
  };

  self.line = function() {
    return [tether.position, player.position];
  };

  self.draw = function() {
    draw({
      type: 'line',
      stroke: true,
      strokeStyle: 'rgba(20, 20, 200, 1)',
      linePaths: [self.line()]
    });

    if (DEBUG) self.drawAreaCoveredThisStep();
  };

  self.drawAreaCoveredThisStep = function() {
    draw({
      type: 'line',
      fill: true,
      fillStyle: rgbWithOpacity([127,127,255], 0.3),
      linePaths: [self.areaCoveredThisStep()]
    });
  };
}

/* ENEMIES */
function Enemy(opts) {
  Mass.call(this);
  this.died = null;
  this.exhausts = [];
  this.spawned = false;

  this.extant = true;  // can die and kill
  this.extanceWarningInterval = 1/5;

  this.spawnAt = opts.spawnAt;
  this.wave = opts.wave;
  this.target = this.getTarget();
}
extend(Mass, Enemy);

// get the array of targets that this enemy can choose from
Enemy.prototype.getTarget = function() {
  return game.player;
};

Enemy.prototype.randomSpawnPosition = function() {
  return somewhereInTheViewport(this.radius);
};

Enemy.prototype.getTargetVector = function() {
  return forXAndY([this.target.position, this.position], forXAndY.subtract);
};

Enemy.prototype.step = function() {
  if (this.force.x !== 0 && this.force.y !== 0 && Math.random() < game.timeDelta * vectorMagnitude(this.velocityDelta())) {
    new Exhaust(this);
  }

  Mass.prototype.step.call(this);
};

// If the player has died in the process of killing the enemy, they do not
// deserve to be rewarded.
Enemy.prototype.die = function(playerDeservesAchievement) {
  if (this.died) {
    if (INFO) console.log('tried to kill enemy that already died');
    return;
  }
  if (playerDeservesAchievement) {
    unlockAchievement('kill');

    var name = this.constructor.name;

    if (game.enemyTypesKilled.indexOf(name) === -1) {
      game.enemyTypesKilled.push(name);
      if (INFO) console.log(game.enemyTypesKilled);
      if (game.enemyTypesKilled.length === enemyPool.length) {
        unlockAchievement('omnicide');
      }
    }
  }
  this.explode();
  this.died = game.timeElapsed;
  game.incrementScore(1);
};

Enemy.prototype.draw = function() {
  if (DEBUG && !this.died) this.drawTargetVector();

  if ((!this.extant)) {
    this.drawExtanceWarning();
  }

  Mass.prototype.draw.call(this);
};

Enemy.prototype.drawExtanceWarning = function() {
  if (this.died) {
    return;
  }
  var timeRemaining = beatsRemaining / music.timeSignature;

  for (var i = 0; i <= 1; i += this.extanceWarningInterval) {
    // we add a big number to timeElapsed to prevent these looking less random at the start of a game
    var baseAngle = ((game.timeElapsed + (this.seed * 1000))/(100*i)) + (i * Math.PI*2) + 0.2 * ((0.5 - i) * timeRemaining);
    var targetLineWidth = (this.radius * this.extanceWarningInterval) + 2;
    var expansion = (Math.PI * 2 * Math.pow(1 - timeRemaining, 4));

    draw({
      type: 'arc',
      stroke: true,
      strokeStyle: rgbWithOpacity(this.rgb, 1 - timeRemaining),
      lineWidth: targetLineWidth * (1 - timeRemaining),
      arcCenter: this.position,
      arcStart: baseAngle - expansion,
      arcFinish: baseAngle + expansion,
      arcRadius: (this.radius * i) * (1 + Math.pow(200 * (i * timeRemaining), 1/2))
    });
  }
};

Enemy.prototype.drawTargetVector = function() {
  draw({
    type: 'line',
    stroke: true,
    strokeStyle: rgbWithOpacity([255,127,127], 0.7),
    linePaths: [[this.position, this.target.position]]
  });
};

Enemy.prototype.drawWarning = function() {
  // Something resembling a more complicated reimplementation of this lives on
  // Idiot. Please be aware of this when tweaking.

  // as a number between 0 and 1
  var timeUntilSpawn = (this.spawnAt - game.timeElapsed) / this.wave.spawnWarningDuration;

  draw({
    type: 'arc',
    stroke: true,
    arcCenter: this.position,
    arcRadius: (this.visibleRadius || this.radius)/2 + Math.pow(timeUntilSpawn, 2) * 700,
    lineWidth: 2 * (this.visibleRadius || this.radius)/2 * Math.pow(1-timeUntilSpawn, 3),
    strokeStyle: rgbWithOpacity(this.rgbWarning || this.rgb, (1 - timeUntilSpawn) * this.getOpacity())
  });
};

// Basically the diamond from Geometry Wars.
function Drifter(opts) {
  Enemy.call(this, opts);
  this.radius = 10;
  this.rgb = [30,150,150];
  this.thrustAngle = undefined;  // we can't get a good targetVector until we've spawned.
  this.walls = true;
  this.bounciness = 1;
  this.power = 0.3;
  this.lubricant = 0.8;
  this.curvature = Math.max(width, height);
}
extend(Enemy, Drifter);

Drifter.prototype.getTarget = function() {
  return game.tether;
};

Drifter.prototype.randomSpawnPosition = function() {
  // If a Drifter spawns close to the edge, it's actually *really difficult* to
  // kill, so we limit outselves to the centre half of the viewport.
  var somewhere = somewhereInTheViewport();
  somewhere.x = (somewhere.x * 2/3) + width/6;
  somewhere.y = (somewhere.y * 2/3) + height/6;
  return somewhere;
};

Drifter.prototype.step = function() {
  if (this.thrustAngle === undefined) {
    // It's easier to hit a drifter who's heading for you, but at the same time
    // we don't want them to be more threatening than necessary, so we'll point
    // in *just* the wrong direction.

    this.thrustAngle = vectorAngle(this.getTargetVector());

    var error = Math.random() + 1;
    if (Math.random() > 0.5) error *= -1;
    this.thrustAngle += error/5;
  }

  if (!this.died) {
    this.force = vectorAt(this.thrustAngle, this.power);
  } else this.force = {x: 0, y: 0};

  Enemy.prototype.step.call(this);
};

Drifter.prototype.bounceCallback = function() {
  this.thrustAngle = vectorAngle(this.velocity);  // just reinforce the bounce
};


// An enemy that gravitates towards its target. Takes a size argument that
// detemines radius and general speediness.
function Idiot(opts) {
  Enemy.call(this, opts);

  var size = opts.size || 0.5 + Math.random();

  // make it slower on smaller screens
  this.mass = size * (1500/maximumPossibleDistanceBetweenTwoMasses);

  this.lubricant = 0.9;
  this.radius = size * 10;
  this.shadowRadius = this.radius + 3;
  this.shadowOpacity = 0.5;
  this.rgb = [255,255,255];
  this.rgbWarning = [50,50,50];
}
extend(Enemy, Idiot);

Idiot.prototype.step = function() {
  if (!this.died) {
    var targetVector = this.getTargetVector();
    targetVectorMagnitude = vectorMagnitude(targetVector);
    this.force = forXAndY([targetVector], function(target) {
      return target * (1/targetVectorMagnitude);
    });
  } else this.force = {x: 0, y: 0};

  Enemy.prototype.step.call(this);
};

// Returns how far the idiot is from its target compared to how far it could
// possibly be.
Idiot.prototype.getRelativeDistance = function() {
  var targetVector = this.getTargetVector();
  return vectorMagnitude(targetVector) / maximumPossibleDistanceBetweenTwoMasses;
};

// Get a value representing how calm the Idiot is.
Idiot.prototype.getCalmness = function() {
  return 1 / Math.pow(1/this.getRelativeDistance(), 1/4);
};

Idiot.prototype.drawWarning = function() {
  // Not, strictly speaking, DRY. It would probably be possible to make
  // Enemy.drawWarning() general-purpose enough to subsume this
  // reimplementation, but Idiot has enough complications that it seems worth
  // doing a custom job.

  var timeUntilSpawn = (this.spawnAt - game.timeElapsed) / this.wave.spawnWarningDuration;

  draw({
    type: 'arc',
    stroke: true,
    lineWidth: 2 * (this.shadowRadius)/2 * Math.pow(1-timeUntilSpawn, 3),
    strokeStyle: rgbWithOpacity(this.rgbWarning || this.rgb, (1 - timeUntilSpawn) * this.getOpacity() * this.shadowOpacity),
    arcCenter: this.position,
    arcRadius: (this.shadowRadius)/2 + Math.pow(timeUntilSpawn, 2) * 700
  });
};


Idiot.prototype.getIrisColor = function() {
  var red = 0;
  if (Math.random() < Math.pow(1 - this.getCalmness(), 4) * game.timeDelta) red = 255;
  return rgbWithOpacity([red, 0, 0], this.getOpacity());
};

Idiot.prototype.awakeness = function() {
  var timeAlive = game.timeElapsed - this.spawnAt;
  return (1 - (1/(timeAlive/3 + 1)));
};

Idiot.prototype.drawIris = function() {
  var awakeness = this.awakeness();
  var targetVector = this.getTargetVector();
  var relativeDistance = this.getRelativeDistance();

  var irisVector = vectorAt(
    vectorAngle(targetVector),
    awakeness * this.radius * Math.pow(relativeDistance, 1/2) * 0.7
  );

  var centreOfIris = forXAndY([this.position, irisVector], forXAndY.add);

  var irisRadius = (this.radius * 1/3) * awakeness;

  draw({
    type: 'arc',
    fill: true,
    fillStyle: this.getIrisColor(),
    arcCenter: centreOfIris,
    arcRadius: irisRadius
  });
};

Idiot.prototype.draw = function() {
  // Draw the shadow.
  draw({
    type: 'arc',
    fill: true,
    fillStyle: rgbWithOpacity([0,0,0], this.getOpacity() * this.shadowOpacity),
    arcCenter: this.position,
    arcRadius: this.shadowRadius
  });

  this.visibleRadius = this.radius * Math.pow(this.awakeness(), 1/6);
  Enemy.prototype.draw.call(this);

  if (this.died) return;  // dead idiots should not have an iris

  this.drawIris();
};


// A hyperactive enemy, thrusting occasionally in the player's direction.
// Unlike Idiot, compensates for her own velocity.
function Twitchy(opts) {
  Enemy.call(this, opts);
  this.charging = false;

  // Calibrated to pretty close to the player.
  this.mass = 100;
  this.lubricant = 0.92;
  this.chargeRate = 0.01;
  this.dischargeRate = 0.1;
  this.radius = 5;

  // Since the player gets a warning that we're about to spawn, it's probably
  // okay if we start with enough fuel to not quite reach our target.
  this.fuel = 0.9;
  this.rgbDischarging = [200,30,30];
  this.rgbWarning = this.rgbDischarging;
}
extend(Enemy, Twitchy);

Twitchy.prototype.step = function() {
  if (this.died || this.charging) {
    this.force = {x: 0, y: 0};
    if (this.charging) {
      this.fuel += (game.timeDelta * this.chargeRate);
      if (this.fuel >= 1) {
        this.fuel = 1;
        this.charging = false;
      }
    }
  } else {
    this.force = this.getTargetVector();
    this.fuel -= (game.timeDelta * this.dischargeRate);

    if (this.fuel <= 0) {
      this.fuel = 0;
      this.charging = true;
    }
  }

  Enemy.prototype.step.call(this);
};

Twitchy.prototype.getCurrentColor = function() {
  if (this.charging) {
    var brightness = 255;
    var whiteness = Math.pow(this.fuel, 1/40);

    if ((0.98 < this.fuel) || (0.94 < this.fuel && this.fuel < 0.96)) {
      // blinking to warn of imminent blast
      brightness = 0;
    }

    this.rgb = [brightness, brightness * whiteness, brightness * whiteness];
  } else this.rgb = this.rgbDischarging;

  return Enemy.prototype.getCurrentColor.call(this);
};

Twitchy.prototype.draw = function() {
  if (this.charging && this.fuel >= 0) {
    // represent how much fuel we have
    draw({
      type: 'arc',
      fill: true,
      fillStyle: rgbWithOpacity([30,30,30], this.getOpacity() * this.fuel),
      arcRadius: this.radius * 1.2/this.fuel,
      arcCenter: this.position
    });
  }

  Enemy.prototype.draw.call(this);
};


/* EFFECTS */
function Particle() {
  Mass.call(this);
  game.particles.push(this);
}
extend(Mass, Particle);
Particle.prototype.isWorthDestroying = function() {
  return (Math.abs(this.velocity.x) < 0.001 && Math.abs(this.velocity.y) < 0.001);
};

function FireParticle(position, velocity) {
  Particle.call(this);
  this.lubricant = 0.9;
  this.created = game.timeElapsed;
  this.teleportTo(position);
  this.velocity = velocity;
  this.red = 1;
  this.green = 1;
  this.blue = 0;
  this.opacity = 1;

  // We don't have to use vectorMagnitude for this; we know that FireParticle
  // always travels in a straight line so velocity.x will always be
  // proportional to absolute velocity (except if velocity.x is 0, which
  // *should* never happen ha ha ha
  this.initialIntensity = velocity.x * (2 * Math.random());
}
extend(Particle, FireParticle);

FireParticle.prototype.getCurrentColor = function() {
  var intensity = this.velocity.x / this.initialIntensity;
  return rgbWithOpacity(this.rgbForIntensity(intensity), Math.pow(intensity, 0.25) * this.opacity);
};

FireParticle.prototype.rgbForIntensity = function(intensity) {
  return [
    (Math.pow(intensity, 0.2) * 255),
    (intensity * 200),
    0
  ];
};

FireParticle.prototype.draw = function() {
  if (Math.random() < 0.1 * game.timeDelta) return; // flicker

  draw({
    type: 'line',
    stroke: true,
    strokeStyle: this.getCurrentColor(),
    linePaths: [[this.position, forXAndY([this.position, this.velocity], forXAndY.aPlusHalfB)]]
  });
};


// Exhaust fired from `source`, a instance of mass. Chooses a direction to start
// moving in based on the force being exerted on the object in question.
function Exhaust(source) {
  var position = source.position;

  var delta = source.velocityDelta();
  var baseVelocity = forXAndY([source.velocity, delta], function(v, d) {
    return (0.3 * v) - (d * 20);
  });

  var deltaMagnitude = vectorMagnitude(delta);
  var velocity = forXAndY([baseVelocity], function(b) {
    return b * (1 + (Math.random() - 0.5) * (0.8 + (deltaMagnitude * 0.1)));
  });

  FireParticle.call(this, position, velocity);

  this.opacity = 0.7;
}
extend(FireParticle, Exhaust);

Exhaust.prototype.rgbForIntensity = function(intensity) {
  return [
    (intensity * 200),
    50 + (intensity * 100),
    50 + (intensity * 100)
  ];
};


// Residue left over from a teleport.
function TeleportDust(source) {
  var randomDelta = vectorAt(Math.random() * Math.PI * 2, Math.random() * source.radius * 0.1);

  var velocityMultiplier = Math.random() * 1/10;
  var baseVelocity = forXAndY([source.teleportDelta, {x: velocityMultiplier, y: velocityMultiplier}], forXAndY.multiply);
  var velocity = forXAndY([baseVelocity, randomDelta], forXAndY.add);

  var distanceFromStart = Math.random();
  var vectorFromStart = forXAndY([source.teleportDelta, {x: distanceFromStart, y: distanceFromStart}], forXAndY.multiply);
  var basePosition = forXAndY([source.position, vectorFromStart], forXAndY.add);
  var position = forXAndY([basePosition, randomDelta], forXAndY.add);

  FireParticle.call(this, position, velocity);
}
extend(FireParticle, TeleportDust);

TeleportDust.prototype.rgbForIntensity = function(intensity) {
  return [
    100 + (intensity * 100),
    (intensity * 200),
    60 + (intensity * 150)
  ];
};


/* WAVES */
function Wave() {
  this.enemies = [];
  this.complete = false;
  this.doneSpawningEnemies = false;
  this.spawnWarningDuration = 50;
  this.boredomCompensation = 0;
  this.startedAt = game.timeElapsed;
}

Wave.prototype.step = function() {
  this.spawnEnemies();

  this.remainingLivingEnemies = 0;

  for (var i = 0; i < this.enemies.length; i++) {
    var enemy = this.enemies[i];
    if (enemy.spawned) enemy.step();
    else if (enemy.spawnAt <= game.timeElapsed) enemy.spawned = true;

    if (!enemy.died) this.remainingLivingEnemies++;
  }

  if (this.remainingLivingEnemies >= 15) unlockAchievement('panic');
  if (this.doneSpawningEnemies && this.remainingLivingEnemies === 0 && !this.hasEnemiesWorthDrawing) this.complete = true;
};

Wave.prototype.draw = function() {
  this.hasEnemiesWorthDrawing = false;

  for (var i = 0; i < this.enemies.length; i++) {
    var enemy = this.enemies[i];
    var opacity = enemy.getOpacity();
    if (opacity > 0.01) {
      if (enemy.spawned) enemy.draw();
      else enemy.drawWarning();

      this.hasEnemiesWorthDrawing = true;
    }
  }
};

Wave.prototype.spawnEnemies = function() {
  if (this.doneSpawningEnemies) return;

  var remaininUnspawnedEnemies = 0;
  var totalDelay = this.boredomCompensation;
  var compensatedForBoredom = false;

  for (var i = 0; i < this.spawns.length; i++) {
    var spawn = this.spawns[i];

    totalDelay += spawn.delay;

    if (spawn.spawned) continue;

    var timeUntilSpawn = totalDelay - (game.timeElapsed - this.startedAt);

    if ((!compensatedForBoredom) && this.remainingLivingEnemies === 0) {
      // We should spawn something sooner than we normally would so the player
      // does not get bored.

      compensatedForBoredom = true;
      this.boredomCompensation += timeUntilSpawn;
      timeUntilSpawn -= this.boredomCompensation;
    }

    if (timeUntilSpawn <= 0) {
      var opts = spawn.opts || {};

      opts.spawnAt = game.timeElapsed + this.spawnWarningDuration;
      opts.wave = this;

      var enemy = new spawn.type(opts);

      if (spawn.pos) {
        enemy.teleportTo({
          x: spawn.pos[0] * width,
          y: spawn.pos[1] * height
        });
      } else enemy.teleportTo(enemy.randomSpawnPosition());

      this.enemies.push(enemy);

      spawn.spawned = true;
    } else {
      remaininUnspawnedEnemies++;
    }
  }

  if (remaininUnspawnedEnemies === 0) this.doneSpawningEnemies = true;
};


// One instance of enemyType in a consistent position.
function tutorialFor(enemyType, enemyOpts) {
  function Tutorial() {
    Wave.call(this);
    this.spawns = [{
        delay: 0,
        type:enemyType,
        pos: [1/2, 1/5],
        opts: enemyOpts || {}
    }];
  }
  extend(Wave, Tutorial);
  return Tutorial;
}


// count instances of enemyType spread out at interval.
function aBunchOf(enemyType, count, interval) {
  function ABunch() {
    Wave.call(this);
    this.spawns = [];

    for (var i = 0; i < count; i++) {
      this.spawns.push({
        delay: interval * (i + 1),
        type: enemyType
      });
    }
  }
  extend(Wave, ABunch);
  return ABunch;
}


// Uncurated garbage for when the tutorials are over.
function autoWave(difficulty) {
  var totalSpawns;
  var localEnemyPool;

  if (difficulty % 2) {
    // this is gonna be a wave of random enemy types
    totalSpawns = 15 + difficulty;
    localEnemyPool = enemyPool;
  } else {
    // this is gonna be a wave of just one enemy
    localEnemyPool = [enemyPool[difficulty/2 % enemyPool.length]];
    totalSpawns = 10 + difficulty;
  }

  function AutoWave() {
    Wave.call(this);
    this.spawns = [];

    for (var i = 0; i < totalSpawns; i++) {
      this.spawns.push({
        delay: Math.pow(Math.random(), 1/2) * 400/(difficulty + 7),
        type: choice(localEnemyPool)
      });
    }
  }

  extend(Wave, AutoWave);
  return AutoWave;
}


/* ACHIEVEMENTS *
 * because it wouldn't be worth playing more than twice without 'em */
var achievements = {
  die: {
    name: "You're coming with me",
    description: 'Take solace in your mutual destruction'
  },
  introduction: {
    name: 'How to play',
    description: 'Die with one point'
  },
  kill: {
    name: 'Weapon of choice',
    description: 'Kill an enemy without dying yourself'
  },
  impact: {
    name: 'Concussion',
    description: 'Feel the impact'
  },
  omnicide: {
    name: 'Omnicide',
    description: 'Kill every type of enemy in one game'
  },
  panic: {
    name: 'Panic',
    description: 'Be alive while fifteen enemies are on screen'
  },
  lowRes: {
    name: 'Cramped',
    description: 'Score ten points at 500x500px or less (currently ' + width + 'x' + height + ')'
  },
  handsFree: {
    name: 'Hands-free',
    description: 'Score five points in a row without moving the tether'
  }
};

function saveCookie(key, value) {
  document.cookie = key + '=' + value + cookieSuffix;
}

function unlockAchievement(slug) {
  var achievement = achievements[slug];
  if (!achievement.unlocked) {
    achievement.unlocked = new Date();
    saveCookie(slug, achievement.unlocked.getTime().toString());
  }
}

function logScore(score) {
  if (score > highScore) {
    highScore = score;
    saveCookie(highScoreCookieKey, score.toString());
  }
}

// Load high score and unlocked achievements from the cookie.
function syncSave(slug) {
  var cookieStrings = document.cookie.split(';');
  for (var i = 0; i < cookieStrings.length; i++) {
    var cs = cookieStrings[i];
    var split = cs.replace(/ /, '').split('=');
    var key = split[0];
    var value = split[1];

    if (key in achievements) {
      achievements[key].unlocked = new Date(parseInt(value, 10));
    } else if (key === highScoreCookieKey) {
      highScore = parseInt(value, 10);
      console.log(highScore);
    }
  }
}

function getUnlockedAchievements(invert) {
  var unlockedAchievements = [];
  invert = invert || false;

  for (var key in achievements) {
    var achievement = achievements[key];
    if (invert ^ (achievement.unlocked !== undefined)) unlockedAchievements.push(achievement);
  }

  return unlockedAchievements;
}

function getLockedAchievements() {
  return getUnlockedAchievements(true);
}


/* THE GAME */
function Game() {
  var self = this;

  self.reset = function(waveIndex) {
    canvas.classList.remove('hidecursor');

    self.background = new Background();
    self.ended = null;
    self.score = 0;
    self.enemyTypesKilled = [];
    self.lastPointScoredAt = 0;
    self.timeElapsed = 0;
    self.normalSpeed = 0.04;
    self.slowSpeed = self.normalSpeed / 100;
    self.setSpeed(self.normalSpeed);

    self.started = false;

    self.waveIndex = waveIndex || 0;
    self.waves = [
      tutorialFor(Drifter),
      aBunchOf(Drifter, 2, 5),

      tutorialFor(Idiot, {size: 1.5}),
      aBunchOf(Idiot, 4, 100),
      aBunchOf(Idiot, 5, 10),

      tutorialFor(Twitchy),
      aBunchOf(Twitchy, 4, 50),
      aBunchOf(Twitchy, 5, 10)
    ];
    self.wave = undefined;

    self.particles = [];

    self.tether = new Tether();
    self.player = new Player(self.tether);
    self.cable = new Cable(self.tether, self.player);
  };

  self.setSpeed = function(speed) {
    self.speed = speed;
  };

  self.start = function() {
    canvas.classList.add('hidecursor');
    self.tether.locked = false;
    self.player.lubricant = self.player.onceGameHasStartedLubricant;
    self.started = true;
    self.timeElapsed = 0;
  };

  self.pickNextWave = function() {
    var waveType = self.waves[self.waveIndex++];

    if (waveType === undefined) {
      waveType = autoWave(self.waveIndex - self.waves.length);
    }

    self.wave = new waveType();
  };

  self.incrementScore = function(incr) {
    if (self.ended) return;
    self.lastPointScoredAt = self.timeElapsed;
    self.score += incr;
    self.tether.pointsScoredSinceLastInteraction += incr;

    if (self.score >= 10 && width <= 500 && height <= 500) {
      unlockAchievement('lowRes');
    }

    if (self.tether.pointsScoredSinceLastInteraction >= 5) {
      unlockAchievement('handsFree');
    }
  };

  self.getIntensity = function() {
    // Get a number representing how the player should be feeling.
    return 1/(1 + (self.timeElapsed - self.lastPointScoredAt));
  };

  self.stepParticles = function() {
    for (var i = 0; i < self.particles.length; i++) {
      if (self.particles[i] === undefined) {
        continue;
      } else if (self.particles[i].isWorthDestroying()) {
        delete self.particles[i];
      } else {
        self.particles[i].step();
      }
    }
  };

  self.step = function() {
    // When DEBUG is on, we sometimes draw stuff outside of draw();
    // so we have to clear earlier than we normally would.
    if (DEBUG) draw({type: 'clear'});

    var now = new Date().getTime();

    if (!self.lastStepped) {
      // While it'd be nice to actually do something here, I really don't think
      // a single frame of blankness is worth losing the pervasiveness of
      // game.timeDelta.
      self.lastStepped = now;
      return;
    } else {
      self.realTimeDelta = now - self.lastStepped;

      // We can't assume we will always be being executed and sometimes
      // computers are just slow.  In these situations, we have to choose a
      // point at which we start to favour slowdown over broken physics.
      // 20FPS seems like about the right point to do that.
      self.timeDelta = Math.min(self.realTimeDelta, 1000/20) * self.speed;

      self.timeElapsed += self.timeDelta;
      self.lastStepped = now;
    }

    self.background.step();

    self.tether.step();
    self.player.step();

    if (self.started) {
      if (self.wave === undefined || self.wave.complete) self.pickNextWave();
      self.wave.step();

      if (!self.ended) self.checkForEnemyContact();
      self.checkForCableContact();
    }

    self.stepParticles();

    self.draw();
  };

  self.checkForCableContact = function() {
    var cableAreaCovered = self.cable.areaCoveredThisStep();

    for (var i = 0; i < self.wave.enemies.length; i++) {
      var enemy = self.wave.enemies[i];

      if (enemy.died || !enemy.spawned || !enemy.extant) {
        continue;
      }

      var journey = enemy.journeySincePreviousFrame();
      var cableLines = linesFromPolygon(cableAreaCovered);

      if (pointInPolygon(enemy.position, cableAreaCovered)) {
        enemy.die(true);
        continue;
      }

      for (var ci = 0; ci < cableLines.length; ci++) {
        var intersection = getIntersection(journey, cableLines[ci]);

        if (intersection.onLine1 && intersection.onLine2) {
          // This is an instance where not calling setPosition is okay because
          // this mass has already moved this step.
          enemy.position = intersection;
          enemy.die(true);
          break;
        }
      }
    }
  };

  self.checkForEnemyContactWith = function(mass) {
    var massPositionDelta = lineDelta([mass.positionOnPreviousFrame, mass.position]);

    var colChecks = [];  // A log of what checks we've run for debug visualisation.

    for (var i = 0; i < self.wave.enemies.length; i++) {
      var enemy = self.wave.enemies[i];

      if (enemy.died || !enemy.spawned || !enemy.extant) {
        continue;
      }

      // Iterate through a bunch of places our objects would have been between
      // this and the last frame and see if any of them collide.
      var enemyPositionDelta = lineDelta([enemy.positionOnPreviousFrame, enemy.position]);

      // We don't want to run unnecessary collision checks, so we decide how
      // many to run based on the velocities and radii of the objects involved.
      for (var progress = 0; progress < 1; progress += (Math.min(enemy.radius, mass.radius))/(3 * Math.max(
        enemyPositionDelta.x, enemyPositionDelta.y, massPositionDelta.x, massPositionDelta.y, 1
      ))) {
        enemyPosition = {
          x: enemy.positionOnPreviousFrame.x + enemyPositionDelta.x * progress,
          y: enemy.positionOnPreviousFrame.y + enemyPositionDelta.y * progress
        };

        massPosition = {
          x: mass.positionOnPreviousFrame.x + massPositionDelta.x * progress,
          y: mass.positionOnPreviousFrame.y + massPositionDelta.y * progress
        };

        if (INFO) this.collisionChecks += 1;
        if (DEBUG) colChecks.push([enemyPosition, massPosition]);

        var distance = lineDelta([enemyPosition, massPosition]);

        if (
          Math.pow(distance.x, 2) + Math.pow(distance.y, 2) <
          Math.pow((enemy.radius + mass.radius), 2)
        ) {
          // We're not moving anything, the objects stopped moving as soon as
          // there was contact, so setPosition is the wrong thing to do.
          enemy.position = enemyPosition;
          mass.position = massPosition;
          enemy.die(false);

          // We only want this achievement to count if you hit it with Player.
          if (mass === this.player) {
            var relativeVelocity = lineDelta([mass.velocity, enemy.velocity]);
            var impact = vectorMagnitude(relativeVelocity) / maximumPossibleDistanceBetweenTwoMasses;

            if (impact > 0.04) unlockAchievement('impact');
            if (INFO) console.log('impact: ' + impact.toString());
          }

          return mass;
        }
      }
    }

    if (DEBUG) draw({
      type: 'line',
      stroke: true,
      linePaths: colChecks,
      strokeStyle: rgbWithOpacity([0,127,0], 0.3)
    });
  };

  self.checkForEnemyContact = function() {
    if (INFO) this.collisionChecks = 0;
    var deadMass = self.checkForEnemyContactWith(self.tether) || self.checkForEnemyContactWith(self.player);
    if (deadMass) {
      deadMass.rgb = [200,20,20];
      deadMass.explode();
      unlockAchievement('die');
      if (game.score === 1) unlockAchievement('introduction');
      game.end();
    }
  };

  self.drawScore = function() {
    if (self.score === 0) return;

    var intensity = self.getIntensity();

    draw({
      type: 'text',
      text: self.score.toString(),
      fontSize: (intensity * height * 5),
      fillStyle: rgbWithOpacity([0,0,0], intensity),
      textPosition: {x: width/2, y: height/2}
    });
  };

  self.drawParticles = function() {
    for (var i = 0; i < this.particles.length; i++) {
      if (this.particles[i] !== undefined) {
        this.particles[i].draw();
      }
    }
  };

  self.drawLogo = function() {
    var opacity;
    if (!game.started) opacity = 1;
    else opacity = Math.pow(1 - game.timeElapsed/50, 3);

    if (opacity < 0.001) return;

    draw({
      type: 'text',
      text: 'tether',
      fillStyle: rgbWithOpacity([0,0,0], opacity),
      fontSize: 100,
      textPosition: {
        x: width/2,
        y: height/3
      }
    });
  };

  self.drawRestartTutorial = function() {
    if (!self.ended) return;

    var opacity = -Math.sin((game.timeElapsed - game.ended) * 3);
    if (opacity < 0) opacity = 0;

    draw({
      type: 'text',
      text: {touch: 'tap', mouse: 'click'}[self.tether.lastInteraction] + ' to retry',
      fontSize: Math.min(width/5, height/8),
      textPosition: {x: width/2, y: height/2},
      fillStyle: rgbWithOpacity([0, 0, 0], opacity)
    });
  };

  self.drawAchievementNotifications = function() {
    // We draw these in real time rather than in game time, so the timing is
    // inconsistent with just about everything else. Here, we're using actual,
    // real milliseconds.

    var now = new Date().getTime();
    var recentAchievements = [];
    var animationDuration = 7000;

    for (var slug in achievements) {
      var achievement = achievements[slug];
      if (achievement.unlocked === undefined) continue;

      var unlocked = achievement.unlocked.getTime();

      if (now > unlocked && now < (unlocked + animationDuration)) {
        recentAchievements.push(achievement);
      }
    }

    for (var i = 0; i < recentAchievements.length; i++) {
      var recentAchievement = recentAchievements[i];
      var progress = (now - recentAchievement.unlocked) / animationDuration;

      var visibility = 1;
      var buffer = 0.2;

      var easing = 6;

      if (progress < buffer) visibility = Math.pow(progress / buffer, 1/easing);
      else if (progress > 1-buffer) visibility = Math.pow((1 - progress) / buffer, easing);

      var sink = -50 * (1 - visibility);  // how far off the top of the screen they should fall.
      var notificationHeight = 60;
      var baseNotificationHeight = 20 + notificationHeight * i;

      var drawArgs = {
        type: 'text',
        text: 'Achievement Unlocked',
        textAlign: 'right',
        textBaseline: 'top',
        fillStyle: rgbWithOpacity([0,0,0], visibility),
        fontFamily: 'Quantico',
        fontSize: 17,
        textPosition: {x: width-25, y: visibility * baseNotificationHeight + sink}
      };

      draw(drawArgs);

      drawArgs.fontSize = 25;
      drawArgs.text = recentAchievement.name;
      drawArgs.textPosition = {x: width - 25, y: 19 + visibility * baseNotificationHeight + sink};

      draw(drawArgs);
    }
  };

  // Extremely stupid; only really for use in
  // drawAchievementUI().
  self.drawAchievements = function(achievementList, fromBottom, headingText, fillStyle) {
    if (achievementList.length === 0) return fromBottom;

    var drawOpts = {
      type: 'text',
      fillStyle: fillStyle,
      textAlign: 'right',
      fontFamily: 'Quantico',
      textBaseline: 'alphabetic'
    };

    for (var i = 0; i < achievementList.length; i++) {
      var achievement = achievementList[i];

      drawOpts.text = achievement.name;
      drawOpts.fontSize = 18;
      drawOpts.textPosition = {x: width-10, y: height - fromBottom - 16};
      draw(drawOpts);

      drawOpts.text = achievement.description;
      drawOpts.fontSize = 13;
      drawOpts.textPosition = {x: width-10, y: height - fromBottom};
      draw(drawOpts);

      fromBottom += 45;
    }

    drawOpts.text = headingText;
    drawOpts.fontSize = 20;
    drawOpts.textPosition = {x: width-10, y: height - fromBottom};
    draw(drawOpts);

    fromBottom += 55;
    return fromBottom;
  };

  self.drawAchievementUI = function() {
    var unlockedAchievements = getUnlockedAchievements();
    if (unlockedAchievements.length > 0) {
      var indicatedPosition = {x: 0, y: 0};
      if (isNaN(game.tether.lastMousePosition.x)) {
        indicatedPosition = {x: 0, y: 0};
      } else {
        indicatedPosition = game.tether.lastMousePosition;
      }
      var distanceFromCorner = vectorMagnitude(lineDelta([indicatedPosition, {x: width, y: height}]));
      var distanceRange = [
        maximumPossibleDistanceBetweenTwoMasses/10,
        maximumPossibleDistanceBetweenTwoMasses/4
      ];
      var hintOpacity;

      if (distanceFromCorner > distanceRange[1]) hintOpacity = 1;
      else if (distanceFromCorner > distanceRange[0]) hintOpacity = (distanceFromCorner - distanceRange[0]) / (distanceRange[1] - distanceRange[0]);
      else hintOpacity = 0;

      var listingOpacity = 1 - hintOpacity;

      // the hint that there is something in this corner
      draw({
        type: 'text',
        text: 'Achievements…',
        fillStyle: fillStyle = rgbWithOpacity([0,0,0], hintOpacity/2),
        textPosition: {x: width-5, y: height-8},
        textAlign: 'right',
        textBaseline: 'alphabetic',
        fontFamily: 'Quantico'
      });

      // the background that makes the listing readable
      draw({
        type: 'rect',
        rectBounds: [0, 0, width, height],
        fillStyle: rgbWithOpacity([255, 255, 255], listingOpacity * 0.9)
      });

      // the listing itself
      var fromBottom = 11;
      fromBottom = this.drawAchievements(getLockedAchievements(), fromBottom, 'Locked', rgbWithOpacity([0,0,0], listingOpacity * 0.5));
      this.drawAchievements(unlockedAchievements, fromBottom, 'Unlocked', rgbWithOpacity([0,0,0], listingOpacity));
    }
  };

  self.drawHighScore = function() {
    if (highScore) {
      draw({
        type: 'text',
        text: 'High score: ' + highScore.toString(),
        fillStyle: fillStyle = rgbWithOpacity([0,0,0], 1),
        fontSize: 15,
        textPosition: {x: 6, y: height-1},
        textAlign: 'left',
        textBaseline: 'bottom',
        fontFamily: 'Quantico'
      });
    }
  };

  self.drawInfo = function() {
    var fromBottom = 7;
    var info = {
      beat: Math.floor(music.beat()),
      measure: Math.floor(music.measure()) + 1,
      time: self.timeElapsed.toFixed(2),
      fps: (1000/self.realTimeDelta).toFixed(),
      score: game.score
    };

    if (self.started) {
      info.wave = this.waveIndex.toString() + ' - ' + this.wave.constructor.name;
      info.colchecks = self.collisionChecks.toFixed();
    }

    for (var key in info) {
      draw({
        type: 'text',
        text: key + ': ' + info[key],
        fontFamily: 'Monaco',
        fontFallback: 'monospace',
        fontSize: 12,
        textAlign: 'left',
        textBaseline: 'alphabetic',
        fillStyle: rgbWithOpacity([0,0,0], 1),
        textPosition: {x: 5, y: height-fromBottom}
      });

      fromBottom += 15;
    }

  };

  self.draw = function() {
    if (!DEBUG) draw({type: 'clear'});

    self.background.draw();
    self.drawScore();
    self.drawParticles();

    if (self.started) self.wave.draw();
    self.cable.draw();
    self.tether.draw();
    self.player.draw();

    self.drawLogo();
    self.drawRestartTutorial();

    self.drawAchievementNotifications();
    if (!self.started || self.ended) {
      self.drawHighScore();
      self.drawAchievementUI();
    }

    if (INFO) self.drawInfo();
  };

  self.end = function() {
    canvas.classList.remove('hidecursor');
    logScore(self.score);
    self.ended = self.timeElapsed;
    self.tether.locked = true;
    self.tether.unlockable = false;
    self.setSpeed(self.slowSpeed);
  };

  self.reset(0);
}

var enemyPool = [Drifter, Idiot, Twitchy];

/* MAKE IT SO */
syncSave();

music = new Music();
game = new Game();

function restartGameIfEnded(e) {
  if (game.ended) {
    game.reset(0);
  }
}

document.addEventListener('mousedown', restartGameIfEnded);
document.addEventListener('touchstart', restartGameIfEnded);

// http://www.paulirish.com/2011/requestanimationframe-for-smart-animating/
window.requestFrame = (
  window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || function(callback){
    window.setTimeout(callback, 1000 / 60);
  }
);

function animate() {
  requestFrame(animate);
  game.step();
}

animate();
