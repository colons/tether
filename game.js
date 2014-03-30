var DEBUG = (window.location.hash === '#DEBUG');
var INFO = (DEBUG || window.location.hash === '#INFO');

var game;
var canvas;
var ctx;
var devicePixelRatio = window.devicePixelRatio || 1;
var width;
var height;
var maximumPossibleDistanceBetweenTwoMasses;


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

function somewhereInTheViewport() {
  return {
    x: Math.random() * width,
    y: Math.random() * height
  };
}

function somewhereJustOutsideTheViewport(buffer) {
  var somewhere = somewhereInTheViewport();
  var edgeSeed = Math.random();
  switch (true) {
    case edgeSeed < 0.25:
      somewhere.x = -buffer;
      break;
    case edgeSeed < 0.5:
      somewhere.x = width + buffer;
      break;
    case edgeSeed < 0.75:
      somewhere.y = -buffer;
      break;
    default:
      somewhere.y = height + buffer;
  }
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
  for (var i = 0; i < arguments.length; i++) {
    s += arguments[i];
  }
  return s;
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

/* GAME OBJECTS */
// The basic object of our physics engine. A circle with mass, position, velocity and forces.
function Mass() {}
Mass.prototype = {
  position: {x: 0, y: 0},
  positionOnPreviousFrame: {x: 0, y: 0},
  velocity: {x: 0, y: 0},
  force: {x: 0, y: 0},
  mass: 1,
  lubricant: 1,
  radius: 0,
  visibleRadius: null,
  walls: false,
  bounciness: 0,
  rgb: [60,60,60],

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
    this.reactToForce();
  },

  getOpacity: function() {
    if (!this.died) return 1;
    else return 0;
  },

  getCurrentColor: function() {
    return rgbWithOpacity(this.rgb, this.getOpacity());
  },

  draw: function() {
    var radius = this.radius;
    if (this.visibleRadius !== null) radius = this.visibleRadius;

    ctx.fillStyle = this.getCurrentColor();
    ctx.beginPath();

    ctx.arc(this.position.x, this.position.y, radius, 0, Math.PI*2);
    ctx.fill();
  },

  explode: function() {
    for (i = 0; i < 50; i++) {
      var angle = Math.random() * Math.PI * 2;
      var magnitude = Math.random() * 40;
      var velocity = forXAndY([vectorAt(angle, magnitude), this.velocity], forXAndY.add);
      (new FireParticle(this.position, velocity));
    }
  },

  focus: function() {
    ctx.strokeStyle = rgbWithOpacity([0,0,0], 0.6);
    var radius = 40 + Math.sin(game.timeElapsed / 10) * 10;
    baseAngle = (game.timeElapsed / 30) + Math.cos(game.timeElapsed / 10) * 0.2;
    ctx.beginPath();
    ctx.arc(this.position.x, this.position.y, radius, baseAngle, baseAngle + Math.PI * 0.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(this.position.x, this.position.y, radius, baseAngle + Math.PI, baseAngle + Math.PI * 1.5);
    ctx.stroke();
  }
};


// Aesthetic garbage
function BackgroundPart(i) {
  Mass.call(this);
  this.visibleRadius = 2 * Math.max(width, height) / i;
  this.radius = 1;
  this.bounciness = 1;
  this.velocity = vectorAt(Math.PI * 2 * Math.random(), i * Math.random() * 0.2);
  this.teleportTo(somewhereInTheViewport());
  this.walls = true;
  this.color = rgbWithOpacity([127,127,127], 0.005 * i);
}
extend(Mass, BackgroundPart);
BackgroundPart.prototype.getCurrentColor = function() {
  return this.color;
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

Tether.prototype.step = function() {
  var leniency;
  if (this.lastInteraction === 'touch') leniency = 50;
  else leniency = 20;

  if (this.unlockable && (vectorMagnitude(forXAndY([this.position, this.lastMousePosition], forXAndY.subtract)) < leniency)) {
    this.locked = false;

    if (!game.started) {
      game.start();
    }
  }

  if (!this.locked) {
    this.setPosition(this.lastMousePosition);
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
    x: (width / 10) * 9,
    y: height / 2
  });
  this.velocity = {x: 0, y: -height/50};
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
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(20, 20, 200, 1)';
    var line = self.line();
    ctx.moveTo(line[0].x, line[0].y);
    ctx.lineTo(line[1].x, line[1].y);
    ctx.stroke();
    if (DEBUG) self.drawAreaCoveredThisStep();
  };

  self.drawAreaCoveredThisStep = function() {
    ctx.beginPath();
    ctx.fillStyle = rgbWithOpacity([127,127,127], 0.3);
    var areaCovered = self.areaCoveredThisStep();
    ctx.moveTo(areaCovered[0].x, areaCovered[0].y);

    for (var i = 1; i < areaCovered.length; i++) {
      ctx.lineTo(areaCovered[i].x, areaCovered[i].y);
    }

    ctx.lineTo(areaCovered[0].x, areaCovered[0].y);
    ctx.fill();
    ctx.closePath();
  };
}

/* ENEMIES */
function Enemy(opts) {
  Mass.call(this);
  this.died = null;
  this.exhausts = [];
  this.spawned = false;

  this.target = opts.target;
  this.spawnAt = opts.spawnAt;
  this.wave = opts.wave;
}
extend(Mass, Enemy);

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

Enemy.prototype.die = function() {
  this.explode();
  this.died = game.timeElapsed;
  game.incrementScore(1);
};

Enemy.prototype.draw = function() {
  if (DEBUG && !this.died) this.drawTargetVector();
  Mass.prototype.draw.call(this);
};

Enemy.prototype.drawTargetVector = function() {
  ctx.strokeStyle = rgbWithOpacity([127,127,127], 0.7);
  ctx.beginPath();
  ctx.moveTo(this.position.x, this.position.y);
  ctx.lineTo(this.target.position.x, this.target.position.y);
  ctx.stroke();
};

Enemy.prototype.drawWarning = function() {
  // as a number between 0 and 1
  var timeUntilSpawn = (this.spawnAt - game.timeElapsed) / this.wave.spawnWarningDuration;

  var radius = timeUntilSpawn * 700;

  ctx.strokeStyle = rgbWithOpacity(this.rgbWarning || this.rgb, 1 - timeUntilSpawn);
  ctx.beginPath();
  ctx.arc(this.position.x, this.position.y, radius, 0, Math.PI*2);
  ctx.stroke();
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
    this.thrustAngle += error/3;
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

  this.mass = size;
  this.lubricant = 0.9;
  this.radius = size * 10;
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

Idiot.prototype.getPupilColor = function() {
  var red = 0;
  if (Math.random() < Math.pow(1 - this.getCalmness(), 4) * game.timeDelta) red = 255;
  return rgbWithOpacity([red, 0, 0], this.getOpacity());
};

Idiot.prototype.draw = function() {
  // Draw the shadow.
  ctx.fillStyle = rgbWithOpacity([0,0,0], this.getOpacity() * 0.5);
  ctx.beginPath();
  ctx.arc(this.position.x, this.position.y, this.radius + 3, 0, Math.PI*2);
  ctx.fill();

  Enemy.prototype.draw.call(this);
  if (this.died) return;

  var targetVector = this.getTargetVector();
  var relativeDistance = this.getRelativeDistance();

  var pupilVector = vectorAt(
    vectorAngle(targetVector),
    this.radius * Math.pow(relativeDistance, 1/2) * 0.7
  );
  var centreOfPupil = forXAndY([this.position, pupilVector], forXAndY.add);

  irisRadius = this.radius * 1/3;

  // Draw the pupil
  ctx.fillStyle = this.getPupilColor();
  ctx.beginPath();
  ctx.arc(centreOfPupil.x, centreOfPupil.y, irisRadius, 0, Math.PI*2);
  ctx.fill();
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
  } else this.rgb = [200,30,30];

  return Enemy.prototype.getCurrentColor.call(this);
};

Twitchy.prototype.draw = function() {
  if (this.charging && this.fuel >= 0) {
    // represent how much fuel we have
    ctx.fillStyle = rgbWithOpacity([30,30,30], this.getOpacity() * this.fuel);
    ctx.beginPath();
    var radius = this.radius * 1.2/this.fuel;
    ctx.arc(this.position.x, this.position.y, radius, 0, Math.PI*2);
    ctx.fill();
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

  ctx.strokeStyle = this.getCurrentColor();
  var endOfStroke = forXAndY([this.position, this.velocity], forXAndY.aPlusHalfB);

  ctx.beginPath();
  ctx.moveTo(this.position.x, this.position.y);
  ctx.lineTo(endOfStroke.x, endOfStroke.y);
  ctx.stroke();
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

  if (this.doneSpawningEnemies && this.remainingLivingEnemies === 0) this.complete = true;
};

Wave.prototype.randomTarget = function() {
  if (Math.random() > 0.5) return game.player;
  else return game.tether;
};

Wave.prototype.draw = function() {
  for (var i = 0; i < this.enemies.length; i++) {
    var enemy = this.enemies[i];
    if (enemy.spawned) enemy.draw();
    else enemy.drawWarning();
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

      // Do not actually follow through on this if i === 0 because we don't
      // ever want to skip a wave's initial delay.
      if (i !== 0) {
        this.boredomCompensation += timeUntilSpawn;
        timeUntilSpawn -= this.boredomCompensation;
      }
    }

    if (timeUntilSpawn <= 0) {
      var opts = spawn.opts || {};

      opts.target = spawn.target || this.randomTarget();
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
function tutorialFor(enemyType, delay, enemyOpts) {
  function Tutorial() {
    Wave.call(this);
    this.spawns = [{
        delay: delay,
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


// Spawn a bunch of enemies in neat lines.
function Rows() {
  Wave.call(this);
  this.spawns = [
    {delay: 0, type: Idiot, pos: [1/5, 4/5], target: game.player, opts: {size: 2}},
    {delay: 5, type: Idiot, pos: [1/5, 3/5], target: game.player, opts: {size: 2}},
    {delay: 5, type: Idiot, pos: [1/5, 2/5], target: game.player, opts: {size: 2}},
    {delay: 5, type: Idiot, pos: [1/5, 1/5], target: game.player, opts: {size: 2}},

    {delay: 50, type: Idiot, pos: [4/5, 1/5], target: game.tether, opts: {size: 0.5}},
    {delay: 5,  type: Idiot, pos: [4/5, 2/5], target: game.tether, opts: {size: 0.5}},
    {delay: 5,  type: Idiot, pos: [4/5, 3/5], target: game.tether, opts: {size: 0.5}},
    {delay: 5,  type: Idiot, pos: [4/5, 4/5], target: game.tether, opts: {size: 0.5}},

    {delay: 100, type: Twitchy, pos: [4/5, 4/5], target: game.tether},
    {delay: 5,   type: Twitchy, pos: [3/5, 4/5], target: game.tether},
    {delay: 5,   type: Twitchy, pos: [2/5, 4/5], target: game.tether},
    {delay: 5,   type: Twitchy, pos: [1/5, 4/5], target: game.tether},

    {delay: 50, type: Twitchy, pos: [1/5, 1/5], target: game.player},
    {delay: 5,  type: Twitchy, pos: [2/5, 1/5], target: game.player},
    {delay: 5,  type: Twitchy, pos: [3/5, 1/5], target: game.player},
    {delay: 5,  type: Twitchy, pos: [4/5, 1/5], target: game.player}
  ];
}
extend(Wave, Rows);


/* THE FINAL WAVE; RANDOM SPAWNS FOREVER *
 *
 * must never set this.complete to true and doesn't use set patterns, so
 * overrides spawnEnemies */

function EndlessRandomWave() {Wave.call(this);}
extend(Wave, EndlessRandomWave);

EndlessRandomWave.prototype.spawnEnemies = function() {
  if (game.timeElapsed > this.startedAt + 100 && Math.random() < 0.02 * game.timeDelta) {
    var target = this.randomTarget();

    var enemyPool = [Idiot, Twitchy, Drifter];
    var enemyType = enemyPool[Math.floor(Math.random() * enemyPool.length)];
    var enemy = new enemyType({
      target: target,
      spawnAt: game.timeElapsed + this.spawnWarningDuration,
      wave: this
    });
    enemy.teleportTo(enemy.randomSpawnPosition());
    this.enemies.push(enemy);
  }
};


/* THE GAME */
function Game() {
  var self = this;

  self.reset = function() {
    self.background = new Background();
    self.ended = null;
    self.score = 0;
    self.lastPointScored = 0;
    self.timeElapsed = 0;
    self.normalSpeed = 0.04;
    self.slowSpeed = self.normalSpeed / 100;
    self.speed = self.normalSpeed;

    self.started = false;

    self.waveIndex = 0;
    self.waves = [
      tutorialFor(Drifter, 100, {size: 2}),
      aBunchOf(Drifter, 5, 100),

      tutorialFor(Idiot, 100, {size: 2}),
      aBunchOf(Idiot, 5, 100),
      aBunchOf(Idiot, 5, 30),

      tutorialFor(Twitchy, 100),
      aBunchOf(Twitchy, 5, 50),
      aBunchOf(Twitchy, 5, 20),

      // Rows,

      EndlessRandomWave
    ];
    self.wave = undefined;

    self.particles = [];

    self.tether = new Tether();
    self.player = new Player(self.tether);
    self.cable = new Cable(self.tether, self.player);
  };

  self.start = function() {
    canvas.classList.add('hidecursor');
    self.tether.locked = false;
    self.player.lubricant = self.player.onceGameHasStartedLubricant;
    self.started = true;
    self.timeElapsed = 0;
  };

  self.pickNextWave = function() {
    self.wave = new self.waves[self.waveIndex++]();
  };

  self.incrementScore = function(incr) {
    if (self.ended) return;
    self.lastPointScored = self.timeElapsed;
    self.score += incr;
    self.player.radius += incr/2;
    self.tether.radius += incr/4;
  };

  self.getIntensity = function() {
    // Get a number representing how the player should be feeling.
    return 1/(1 + (self.timeElapsed - self.lastPointScored));
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
    if (DEBUG) ctx.clearRect(0, 0, width, height);

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
      if (enemy.died || !enemy.spawned) {
        continue;
      }

      var journey = enemy.journeySincePreviousFrame();
      var cableLines = linesFromPolygon(cableAreaCovered);

      if (pointInPolygon(enemy.position, cableAreaCovered)) {
        enemy.die();
        continue;
      }

      for (var ci = 0; ci < cableLines.length; ci++) {
        var intersection = getIntersection(journey, cableLines[ci]);

        if (intersection.onLine1 && intersection.onLine2) {
          enemy.die();
          break;
        }
      }
    }
  };

  self.checkForEnemyContactWith = function(mass) {
    var massPositionDelta = lineDelta([mass.positionOnPreviousFrame, mass.position]);

    for (var i = 0; i < self.wave.enemies.length; i++) {
      var enemy = self.wave.enemies[i];
      if (enemy.died || !enemy.spawned) {
        continue;
      }

      var enemyPositionDelta = lineDelta([enemy.positionOnPreviousFrame, enemy.position]);

      // Iterate through a bunch of places our objects should have been in the
      // last frame and see if any of them collide.
      if (DEBUG) {
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
      }

      for (var progress = 0; progress < 1; progress += (Math.min(enemy.radius, mass.radius))/Math.max(
        enemyPositionDelta.x, enemyPositionDelta.y, massPositionDelta.x, massPositionDelta.y, 1
      )) {
        enemyPosition = {
          x: enemy.positionOnPreviousFrame.x + enemyPositionDelta.x * progress,
          y: enemy.positionOnPreviousFrame.y + enemyPositionDelta.y * progress
        };

        massPosition = {
          x: mass.positionOnPreviousFrame.x + massPositionDelta.x * progress,
          y: mass.positionOnPreviousFrame.y + massPositionDelta.y * progress
        };

        if (INFO) this.collisionChecks += 1;
        if (DEBUG) {
          ctx.moveTo(enemyPosition.x, enemyPosition.y);
          ctx.lineTo(massPosition.x, massPosition.y);
        }

        var distance = lineDelta([enemyPosition, massPosition]);

        if (
          Math.pow(distance.x, 2) + Math.pow(distance.y, 2) <
          Math.pow((enemy.radius + mass.radius), 2)
        ) {
          // We're not moving anything, the objects stopped moving as soon as
          // there was contact, so setPosition is the wrong thing to do.
          enemy.position = enemyPosition;
          mass.position = massPosition;
          enemy.die();
          return mass;
        }
      }

      if (DEBUG) ctx.stroke();
    }
  };

  self.checkForEnemyContact = function() {
    if (INFO) this.collisionChecks = 0;
    var deadMass = self.checkForEnemyContactWith(self.tether) || self.checkForEnemyContactWith(self.player);
    if (deadMass) {
      deadMass.rgb = [200,20,20];
      deadMass.explode();
      game.end();
    }
  };

  self.drawScore = function() {
    if (self.score === 0) return;

    var intensity = self.getIntensity();

    ctx.font = (intensity * height * 5).toString() + 'px "Tulpen One", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = rgbWithOpacity([0,0,0], intensity);
    ctx.fillText(self.score.toString(), width/2, height/2);
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

    // text
    var centre;

    if (width < 500) {
      // Prevent the logo clipping off the right side of the screen on narrow
      // devices.
      centre = {
        x: width/2,
        y: height/3
      };
      ctx.textAlign = 'center';
    } else {
      centre = {
        x: width/2 + 80,
        y: 2 * height/3
      };
      ctx.textAlign = 'left';
    }

    ctx.textBaseline = 'middle';
    ctx.fillStyle = rgbWithOpacity([0,0,0], opacity);
    ctx.font = '100px "Tulpen One", sans-serif';
    ctx.fillText('tether', centre.x + height/100, centre.y - height/100);
  };

  self.drawRestartTutorial = function() {
    if (!self.ended) return;

    var opacity = -Math.sin((game.timeElapsed - game.ended) * 3);
    if (opacity < 0) opacity = 0;

    ctx.font = (Math.min(width/5, height/8)).toString() + 'px "Tulpen One", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = rgbWithOpacity([0,0,0], opacity);
    ctx.fillText({touch: 'tap', mouse: 'click'}[self.tether.lastInteraction] + ' to restart', width/2, height/2);
  };

  self.drawInfo = function() {
    var fromBottom = 7;
    var info = {
      time: self.timeElapsed.toFixed(2),
      fps: (1000/self.realTimeDelta).toFixed()
    };

    if (self.started) {
      info.wave = this.waveIndex.toString() + ' - ' + this.wave.constructor.name;
      info.colchecks = self.collisionChecks.toFixed();
    }
  
    for (var key in info) {
      ctx.font = '15px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = rgbWithOpacity([0,0,0], 1);
      ctx.fillText(key + ': ' + info[key], 5, height-fromBottom);
      fromBottom += 18;
    }
  };

  self.draw = function() {
    if (!DEBUG) ctx.clearRect(0, 0, width, height);

    self.background.draw();
    self.drawScore();
    self.drawParticles();

    if (self.started) self.wave.draw();
    self.cable.draw();
    self.tether.draw();
    self.player.draw();

    self.drawLogo();
    self.drawRestartTutorial();

    if (INFO) self.drawInfo();
  };

  self.end = function() {
    canvas.classList.remove('hidecursor');
    self.ended = self.timeElapsed;
    self.tether.locked = true;
    self.tether.unlockable = false;
    self.speed = self.slowSpeed;
  };

  self.reset();
}

/* FIRE */
initCanvas();
game = new Game();

function restartGameIfEnded(e) {
  if (game.ended) {
    game.reset();
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
