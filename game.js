var game;
var ctx;

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
    x: Math.random() * ctx.canvas.width,
    y: Math.random() * ctx.canvas.height
  };

  var edgeSeed = Math.random();
  switch (true) {
    case edgeSeed < 0.25:
      somewhere.x = -buffer;
      break;
    case edgeSeed < 0.5:
      somewhere.x = ctx.canvas.width + buffer;
      break;
    case edgeSeed < 0.75:
      somewhere.y = -buffer;
      break;
    default:
      somewhere.y = ctx.canvas.height + buffer;
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
  return 'rgba(' + rgb.join(',') + ',' + opacity.toString() + ')';
}

/* SETUP */
function scaleCanvas() {
  ctx.canvas.width = window.innerWidth;
  ctx.canvas.height = window.innerHeight;
}

function initCanvas() {
  // XXX lock width and height at this point so that scrollbars appear when the
  // window resizes, which should be enough of a clue that we don't adapt
  // dynamically to the size of the player's screen.

  ctx = document.getElementById('game').getContext('2d');
  scaleCanvas();
  window.addEventListener('resize', scaleCanvas);
}

function edgesOfCanvas() {
  return linesFromPolygon([
    {x: 0, y: 0},
    {x:0, y: ctx.canvas.height},
    {x: ctx.canvas.width, y: ctx.canvas.height},
    {x: ctx.canvas.width, y: 0},
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
    ctx.closePath();
    ctx.fill();
  },

  explode: function() {
    for (i = 0; i < 50; i++) {
      var angle = Math.random() * Math.PI * 2;
      var magnitude = Math.random() * 40;
      var velocity = forXAndY([vectorAt(angle, magnitude), this.velocity], add);
      (new FireParticle(this.position, velocity));
    }
  }
};


// The thing the player is attached to.
function Tether() {
  Mass.call(this);
  this.radius = 5;
  
  this.locked = true;
  this.rgb = [20,20,200];

  this.position = {
    x: ctx.canvas.width / 2,
    y: ctx.canvas.height / 2
  };

  this.lastMousePosition = {x: NaN, y: NaN};

  var self = this;

  document.addEventListener('mousemove', function(e) {
    if (e.target === ctx.canvas) {
      self.lastMousePosition = {x: e.layerX, y: e.layerY};
    }
  });

  return this;
}
extend(Mass, Tether);

Tether.prototype.step = function() {
  if (!this.locked) {
    this.setPosition(this.lastMousePosition);
  } else if (!game.started) {
    if (vectorMagnitude(forXAndY([this.position, this.lastMousePosition], subtract)) < 20) {
      game.start();
    } else if (Math.random() < 0.03 * game.speed) {
      this.explode();
    }
  }
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
    x: (ctx.canvas.width / 10),
    y: (ctx.canvas.height / 3) * 2
  };
  this.velocity = {x: 0, y: ctx.canvas.height/50};

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
    ctx.closePath();
  };
}

/* ENEMIES */
function Enemy(opts) {
  Mass.call(this);
  this.died = null;
  this.exhausts = [];
  this.target = opts.target;
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

  // Give just enough fuel to get away from the edge of the screen; to start
  // with a full load of fuel would be super, super mean.
  this.fuel = 0.2;

  // Calibrated to pretty close to the player.
  this.mass = 100;
  this.lubricant = 0.92;
  this.chargeRate = 0.01;
  this.dischargeRate = 0.1;
  this.radius = 5;
  this.walls = edgesOfCanvas();
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
    ctx.closePath();
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
    (Math.pow(intensity, 0.2) * 255 * this.red).toFixed(0),
    (intensity * 200 * this.green).toFixed(0),
    (intensity * 200 * this.blue).toFixed(0)
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
  ctx.closePath();
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
    self.ended = false;
    self.score = 0;
    self.lastPointScored = 0;
    self.timeElapsed = 0;
    self.normalSpeed = 0.4;
    self.slowSpeed = self.normalSpeed / 100;
    self.speed = self.normalSpeed;
    self.started = false;

    self.enemies = [];
    self.particles = [];

    self.tether = new Tether();
    self.player = new Player(self.tether);
    self.cable = new Cable(self.tether, self.player);
  };

  self.start = function() {
    ctx.canvas.classList.add('hidecursor');
    self.tether.locked = false;
    self.player.lubricant = self.player.onceGameHasStartedLubricant;
    self.started = true;
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
    if (self.started) {
      self.spawnEnemies();
      self.timeElapsed += self.speed;
    }

    self.tether.step();
    self.player.step();

    self.stepParticles();

    for (var i = 0; i < self.enemies.length; i++) {
      self.enemies[i].step();
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
      var enemy = new enemyType({target: target});
      enemy.position = somewhereJustOutsideTheViewport(enemy.radius);
      self.enemies.push(enemy);
    }
  };

  self.checkForCableContact = function() {
    var cableAreaCovered = self.cable.areaCoveredThisStep();

    for (var i = 0; i < self.enemies.length; i++) {
      var enemy = self.enemies[i];
      if (enemy.died) {
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
      if (enemy.died) {
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

    ctx.font = (intensity * ctx.canvas.height * 5).toString() + 'px "Tulpen One" sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = rgbWithOpacity([0,0,0], intensity);
    ctx.fillText(self.score.toString(), ctx.canvas.width/2, ctx.canvas.height/2);
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
      enemy.draw();
    }
  };

  self.draw = function() {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#000';
    ctx.font = '10px fixed';
    ctx.fillText(self.timeElapsed.toFixed(2), 5, 10);

    self.drawScore();
    self.drawParticles();
    self.drawEnemies();

    self.cable.draw();
    self.tether.draw();
    self.player.draw();
  };

  self.end = function() {
    ctx.canvas.classList.remove('hidecursor');
    self.ended = true;
    self.tether.locked = true;
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
