var game;
var canvas;
var ctx;
var devicePixelRatio = window.devicePixelRatio || 1;
var width;
var height;


/* UTILITIES */
function extend(base, sub) {
  sub.prototype = Object.create(base.prototype);
  sub.prototype.constructor = sub;
  Object.defineProperty(sub.prototype, 'constructor', {
    enumerable: false,
    value: sub
  });
}

function somewhereJustOutsideTheViewport(buffer) {
  var somewhere = {
    x: Math.random() * width,
    y: Math.random() * height
  };

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

function add() {
  var s = 0;
  for (var i = 0; i < arguments.length; i++) {
    s += arguments[i];
  }
  return s;
}

function subtract(a, b) {
  return a - b;
}

function randomisedVector(vector, potentialMagnitude) {
  var angle = Math.random() * Math.PI * 2;
  var magnitude = Math.random() * potentialMagnitude;
  return forXAndY([vector, vectorAt(angle, magnitude)], add);
}

function multiply() {
  var p = 0;
  for (var i = 0; i < arguments.length; i++) {
    p *= arguments[i];
  }
  return p;
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
  return forXAndY(line, subtract);
}

function rgbWithOpacity(rgb, opacity) {
  var rgbStrings = [];
  for (var i = 0; i < rgb.length; i++) rgbStrings.push(rgb[i].toFixed(0));
  return 'rgba(' + rgbStrings.join(',') + ',' + opacity.toString() + ')';
}

/* SETUP */
function scaleCanvas() {
  width = window.innerWidth;
  height = window.innerHeight;

  canvas.width = width * devicePixelRatio;
  canvas.height = height * devicePixelRatio;

  canvas.style.width = width.toString() + 'px';
  canvas.style.height = height.toString() + 'px';

  ctx.scale(devicePixelRatio, devicePixelRatio);
}

function initCanvas() {
  canvas = document.getElementById('game');
  ctx = canvas.getContext('2d');
  scaleCanvas();
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
  walls: [],
  rgb: [60,60,60],

  journeySincePreviousFrame: function() {
    return [this.positionOnPreviousFrame, this.position];
  },

  collideWithWalls: function () {
    for (var i = 0; i < this.walls.length; i++) {
      var wall = this.walls[i];
      // XXX move the wall towards us perpendicular to its direction by our radius
      var intersection = getIntersection(wall, [this.positionOnPreviousFrame, this.position]);

      if (intersection.onLine1 && intersection.onLine2) {
        // XXX bounce
        this.velocity = {x: 0, y: 0};
        this.position.x = intersection.x;
        this.position.y = intersection.y;
      }
    }
  },

  setPosition: function(position) {
    this.positionOnPreviousFrame = this.position;
    this.position = position;
  },

  reactToVelocity: function() {
    // set position based on velocity
    this.setPosition(forXAndY([this.position, this.velocity], function(pos, vel) {
      return pos + (vel * game.speed);
    }));
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
    var projectedVelocity = forXAndY([this.velocity, this.velocityDelta()], function(vel, delta) {
      return vel + delta * game.speed;
    });

    this.velocity = forXAndY([projectedVelocity], function(projected) {
      return projected * Math.pow(self.lubricant, game.speed);
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
    ctx.fillStyle = this.getCurrentColor();
    ctx.beginPath();
    ctx.arc(this.position.x, this.position.y, this.radius, 0, Math.PI*2);
    ctx.fill();
  },

  explode: function() {
    for (i = 0; i < 50; i++) {
      var angle = Math.random() * Math.PI * 2;
      var magnitude = Math.random() * 40;
      var velocity = forXAndY([vectorAt(angle, magnitude), this.velocity], add);
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


// The thing the player is attached to.
function Tether() {
  Mass.call(this);
  this.radius = 5;
  
  this.locked = true;
  this.unlockable = true;
  this.rgb = [20,20,200];

  this.position = {
    x: width / 2,
    y: (height / 3) * 2
  };

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

  if (this.unlockable && (vectorMagnitude(forXAndY([this.position, this.lastMousePosition], subtract)) < leniency)) {
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
  this.walls = edgesOfCanvas();
  this.position = {
    x: (width / 10) * 9,
    y: height / 2
  };
  this.velocity = {x: 0, y: -height/50};

  this.tether = tether;
  this.rgb = [20,20,200];
}
extend(Mass, Player);

Player.prototype.step = function() {
  this.force = forXAndY([this.tether.position, this.position], subtract);
  Mass.prototype.step.call(this);
};


// The cable connecting Player to Tether.
function Cable(tether, player) {
  var self = this;

  self.areaCoveredThisStep = function() {
    return [
      tether.position,
      tether.positionOnPreviousFrame,
      player.positionOnPreviousFrame,
      player.position
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
}
extend(Mass, Enemy);

Enemy.prototype.getTargetVector = function() {
  return forXAndY([this.target.position, this.position], function(them, us) {
    return them - us;
  });
};

Enemy.prototype.step = function() {
  if (this.force.x !== 0 && this.force.y !== 0 && Math.random() < game.speed * vectorMagnitude(this.velocityDelta())) {
    new Exhaust(this);
  }

  Mass.prototype.step.call(this);
};

Enemy.prototype.die = function() {
  this.explode();
  this.died = game.timeElapsed;
  game.incrementScore(1);
};

Enemy.prototype.drawWarning = function() {
  // as a number between 0 and 1
  var timeUntilSpawn = (this.spawnAt - game.timeElapsed) / game.spawnWarningDuration;

  var radius = timeUntilSpawn * 700;

  ctx.strokeStyle = rgbWithOpacity(this.rgb, 1 - timeUntilSpawn);
  ctx.beginPath();
  ctx.arc(this.position.x, this.position.y, radius, 0, Math.PI*2);
  ctx.stroke();
};

function Idiot(opts) {
  // A very stupid enemy. Basically the diamond from Geometry Wars.
  Enemy.call(this, opts);

  var size = 0.5 + Math.random();

  this.mass = size;
  this.lubricant = 0.9;
  this.radius = size * 10;
  this.deathDuration = 50;
  this.rgb = [60,100,60];
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
  this.walls = edgesOfCanvas();

  // Since the player gets a warning that we're about to spawn, it's probably
  // okay if we start with enough fuel to not quite reach our target.
  this.fuel = 0.9;

}
extend(Enemy, Twitchy);

Twitchy.prototype.step = function() {
  if (this.died || this.charging) {
    this.force = {x: 0, y: 0};
    if (this.charging) {
      this.fuel += (game.speed * this.chargeRate);
      if (this.fuel >= 1) this.charging = false;
    }
  } else {
    this.force = this.getTargetVector();
    this.fuel -= (game.speed * this.dischargeRate);

    if (this.fuel <= 0) this.charging = true;
  }

  Enemy.prototype.step.call(this);
};

Twitchy.prototype.getCurrentColor = function() {
  if (this.charging) {
    this.rgb = [30,30,200];
  }
  else this.rgb = [200,30,30];

  return Enemy.prototype.getCurrentColor.call(this);
};

Twitchy.prototype.draw = function() {
  Enemy.prototype.draw.call(this);

  if ((!this.charging) || this.fuel <= 0) return;
  else {
    // represent how much fuel we have
    ctx.fillStyle = rgbWithOpacity([30,30,30], this.getOpacity() * this.fuel);
    ctx.beginPath();
    var radius = this.radius * 1/this.fuel;
    ctx.arc(this.position.x, this.position.y, radius, 0, Math.PI*2);
    ctx.fill();
  }
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
  this.position = position;
  this.velocity = velocity;
  this.initialIntensity = vectorMagnitude(velocity) * (2 * Math.random());
  this.red = 1;
  this.green = 1;
  this.blue = 0;
  this.opacity = 1;
}
extend(Particle, FireParticle);

FireParticle.prototype.getCurrentColor = function() {
  var intensity = vectorMagnitude(this.velocity) / this.initialIntensity;
  return rgbWithOpacity([
    (Math.pow(intensity, 0.2) * 255 * this.red),
    (intensity * 200 * this.green),
    (intensity * 200 * this.blue)
  ], Math.pow(intensity, 0.25) * this.opacity);
};

FireParticle.prototype.draw = function() {
  ctx.strokeStyle = this.getCurrentColor();
  var endOfStroke = forXAndY([this.position, this.velocity], function(p, v) {
    return p + (v * 5);
  });

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

  this.red = 0.8;
  this.green = 0.8;
  this.blue = 0.8;
  this.opacity = 0.7;
}
extend(FireParticle, Exhaust);


/* THE GAME */
function Game() {
  var self = this;

  self.reset = function() {
    self.ended = null;
    self.score = 0;
    self.lastPointScored = 0;
    self.timeElapsed = 0;
    self.normalSpeed = 0.4;
    self.slowSpeed = self.normalSpeed / 100;
    self.speed = self.normalSpeed;
    self.spawnWarningDuration = 50;
    self.started = false;

    self.enemies = [];
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

  self.incrementScore = function(incr) {
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
    self.timeElapsed += self.speed;

    if (self.started) {
      self.spawnEnemies();
    }

    self.tether.step();
    self.player.step();

    self.stepParticles();

    for (var i = 0; i < self.enemies.length; i++) {
      var enemy = self.enemies[i];
      if (enemy.spawned) enemy.step();
      else if (enemy.spawnAt <= self.timeElapsed) enemy.spawned = true;
    }

    if (!self.ended) {
      self.checkForCableContact();
      self.checkForEnemyContact();
    }

    self.draw();
  };

  self.spawnEnemies = function() {
    if (Math.random() < 0.02 * game.speed) {
      var target;
      if (Math.random() > 0.5) target = self.player;
      else target = self.tether;

      var enemyPool = [Idiot, Twitchy];
      var enemyType = enemyPool[Math.floor(Math.random() * enemyPool.length)];
      var enemy = new enemyType({
        target: target,
        spawnAt: self.timeElapsed + self.spawnWarningDuration
      });
      enemy.position = somewhereJustOutsideTheViewport(enemy.radius);
      self.enemies.push(enemy);
    }
  };

  self.checkForCableContact = function() {
    var cableAreaCovered = self.cable.areaCoveredThisStep();

    for (var i = 0; i < self.enemies.length; i++) {
      var enemy = self.enemies[i];
      if (enemy.died || !enemy.spawned) {
        continue;
      }

      var journey = enemy.journeySincePreviousFrame();
      var cableLines = linesFromPolygon(cableAreaCovered);

      for (var ci = 0; ci < cableLines.length; ci++) {
        var intersection = getIntersection(journey, cableLines[ci]);

        if (intersection.onLine1 && intersection.onLine2) {
          enemy.die();
          break;
        }
      }

      if (pointInPolygon(enemy.position, cableAreaCovered)) {
        enemy.die();
      }
    }
  };

  self.checkForEnemyContactWith = function(mass) {
    for (var i = 0; i < self.enemies.length; i++) {
      var enemy = self.enemies[i];
      if (enemy.died || !enemy.spawned) {
        continue;
      }

      if (
        vectorMagnitude(lineDelta([enemy.position, mass.position])) <
        (enemy.radius + mass.radius)
      ) {
        enemy.die();
        return mass;
      }
    }
  };

  self.checkForEnemyContact = function() {
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

  self.drawEnemies = function() {
    for (var i = 0; i < self.enemies.length; i++) {
      var enemy = self.enemies[i];
      if (enemy.spawned) enemy.draw();
      else enemy.drawWarning();
    }
  };

  self.drawLogo = function() {
    var opacity;
    if (!game.started) opacity = 1;
    else opacity = 1 - game.timeElapsed/50;

    if (opacity < 0.001) return;

    var centre = {
      x: width/2 + 80,
      y: 2 * height/3
    };

    // text
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = rgbWithOpacity([0,0,0], opacity);
    ctx.font = '100px "Tulpen One", sans-serif';
    ctx.fillText('tether', centre.x + height/100, centre.y - height/100);
  };

  self.drawRestartTutorial = function() {
    if (!self.ended) return;

    var opacity = -Math.sin((game.timeElapsed - game.ended) * 3);
    if (opacity < 0) opacity = 0;

    ctx.font = (height/8).toString() + 'px "Tulpen One", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = rgbWithOpacity([0,0,0], opacity);
    ctx.fillText({touch: 'tap', mouse: 'click'}[self.tether.lastInteraction] + ' to restart', width/2, height/2);
  };

  self.draw = function() {
    ctx.clearRect(0, 0, width, height);

    self.drawScore();
    self.drawParticles();
    self.drawEnemies();

    self.cable.draw();
    self.tether.draw();
    self.player.draw();

    self.drawLogo();
    self.drawRestartTutorial();
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

document.addEventListener('mousedown', function(e) {
  if (game.ended) {
    game.reset();
  }
});

setInterval(game.step, 10);
