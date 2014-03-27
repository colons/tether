var game;
var ctx;

/* UTILITIES */
// All this maths bullshit should probably be refactored into Point and Line
// objects. I'd suggest a Vector as well, but Vector would have the same
// interface as Point, so they may as well be the same object.

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

function forXAndY(objs, func) {
  function getAttributeFromAllObjs(attr) {
    var attrs = [];
    for (var i = 0; i < objs.length; i++) {
      attrs.push(objs[i][attr]);
    }
    return attrs;
  }
  return {
    x: func.apply(null, getAttributeFromAllObjs('x')),
    y: func.apply(null, getAttributeFromAllObjs('y'))
  };
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
  return Math.pow(Math.pow(vector.x, 2) + Math.pow(vector.y, 2), 1/2);
}

function vectorAngle(vector) {
  return Math.atan(vector.x, vector.y);
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
  return forXAndY(line, function(a, b) {
    return b - a;
  });
}

/* SETUP */
function scaleCanvas() {
  ctx.canvas.width = window.innerWidth;
  ctx.canvas.height = window.innerHeight;
}

function initCanvas() {
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

  reactToVelocity: function () {
    // set position based on velocity
    this.setPosition(forXAndY([this.position, this.velocity], function(pos, vel) {
      return pos + (vel * game.speed);
    }));
    this.collideWithWalls();
  },

  reactToForce: function() {
    // set velocity and position based on force
    var self = this;
    var projectedVelocity = forXAndY([this.velocity, this.force], function(vel, force) {
      return vel + ((force * game.speed) / self.mass);
    });

    this.velocity = forXAndY([projectedVelocity], function(projected) {
      return projected * Math.pow(self.lubricant, game.speed);
    });

    this.reactToVelocity();
  },

  step: function() {
    this.reactToForce();
  }
};


// The thing the player is attached to.
function Tether() {
  Mass.call(this);
  this.radius = 5;
  
  this.locked = false;
  this.color = '#6666dd';

  // XXX strip out once we have proper spawning
  this.lastMousePosition = {x: 0, y: 0};
  this.lastUnlockedMousePosition = {x: 0, y: 0};

  var self = this;

  document.addEventListener('mousemove', function(e) {
    if (e.target === ctx.canvas) {
      self.lastMousePosition = {x: e.layerX, y: e.layerY};
    }
  });

  return this;
}
extend(Mass, Tether);

Tether.prototype.draw = function() {
  ctx.fillStyle = this.color;
  ctx.beginPath();
  ctx.arc(this.position.x, this.position.y, this.radius, 0, Math.PI*2);
  ctx.closePath();
  ctx.fill();
};

Tether.prototype.step = function() {
  if (!this.locked) {
    this.lastUnlockedMousePosition = this.lastMousePosition;
  }
  this.setPosition(this.lastUnlockedMousePosition);
};


// The player. A weight on the end of a bungee cord.
function Player(tether) {
  Mass.call(this);
  this.force = {x: 1, y: 1};
  this.mass = 50;
  this.lubricant = 0.99;
  this.radius = 10;
  this.walls = edgesOfCanvas();

  this.tether = tether;
  this.color = '#6666dd';
}
extend(Mass, Player);

Player.prototype.draw = function() {
  ctx.fillStyle = this.color;
  ctx.beginPath();
  ctx.arc(this.position.x, this.position.y, this.radius, 0, Math.PI*2);
  ctx.closePath();
  ctx.fill();
};

Player.prototype.step = function() {
  this.force = forXAndY([this.tether.position, this.position], function(tpos, ppos) {
    return tpos - ppos;
  });
  Mass.prototype.step.call(this);
};

Player.prototype.die = function() {
  this.color = '#ff0000';
  this.tether.color = '#ff0000';
  game.end();
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
function Enemy(target) {
  Mass.call(this);
  this.died = null;
  this.target = target;
  this.deathDuration = 200;
  this.rgb = '100,100,0';
  this.rgbDead = '200,30,30';
  this.exhausts = [];
}
extend(Mass, Enemy);

Enemy.prototype.getTargetVector = function() {
  return forXAndY([this.target.position, this.position], function(them, us) {
    return them - us;
  });
};

Enemy.prototype.isWorthDestroying = function() {
  return (this.died && game.timeElapsed < (this.died + this.deathDuration));
};

Enemy.prototype.step = function() {
  if (this.force.x !== 0 && this.force.y !== 0 && Math.random() < 1 * game.speed) {
    this.exhausts.push(new Exhaust(this));
  }

  for (var i = 0; i < this.exhausts.length; i++) {
    if (this.exhausts[i] === undefined) {
      continue;
    } else if (this.exhausts[i].isWorthDestroying()) {
      delete this.exhausts[i];
    } else {
      this.exhausts[i].step();
    }
  }

  Mass.prototype.step.call(this);
};

Enemy.prototype.draw = function() {
  // Don't override this; override drawAlive and drawDead instead.
  
  for (var i = 0; i < this.exhausts.length; i++) {
    if (this.exhausts[i] !== undefined) {
      this.exhausts[i].draw();
    }
  }

  if (this.died !== null) {
    this.drawDead();
  } else {
    this.drawAlive();
  }
};

Enemy.prototype.drawAlive = function() {
  ctx.fillStyle = 'rgb(' + this.rgb + ')';
  ctx.beginPath();
  ctx.arc(this.position.x, this.position.y, this.radius, 0, Math.PI*2);
  ctx.closePath();
  ctx.fill();
};

Enemy.prototype.drawDead = function() {
  var opacity;
  opacity = 1 - ((game.timeElapsed - this.died) / this.deathDuration);

  ctx.fillStyle = 'rgba(' + this.rgbDead + ',' + opacity.toString() + ')';
  ctx.beginPath();
  ctx.arc(this.position.x, this.position.y, this.radius, 0, Math.PI*2);
  ctx.closePath();
  ctx.fill();
};

Enemy.prototype.die = function() {
  this.died = game.timeElapsed;
};

function Idiot(target) {
  // A very stupid enemy. Basically the diamond from Geometry Wars.
  Enemy.call(this, target);

  this.mass = 1;
  this.lubricant = 0.9;
  this.radius = 10;
  this.position = somewhereJustOutsideTheViewport(this.radius);
}
extend(Enemy, Idiot);

Idiot.prototype.step = function() {
  if (!this.died) {
    var targetVector = this.getTargetVector();
    targetVectorMagnitude = vectorMagnitude(targetVector);
    this.force = forXAndY([targetVector], function(force) {
      return force * (1/targetVectorMagnitude);
    });
  } else {
    this.force = {x: 0, y: 0};
  }

  Enemy.prototype.step.call(this);
};


// A hyperactive enemy, thrusting occasionally in the player's general direction.
// XXX needs implemented
function Twitchy() {}


/* EFFECTS */
// Exhuast fired from `source`, a instance of mass. Chooses a direction to start
// moving in based on the acceleration of the object in question.
function Exhaust(source) {
  Mass.call(this);
  this.position = source.position;
  this.color = '#c52';
  this.radius = 2;
  this.lubricant = 0.9;
  this.created = game.timeElapsed;

  baseVelocity = forXAndY([source.velocity, source.force], function(v, f) {
    return v - (f * 10 / source.mass) + (Math.random() - 0.5);
  });

  var baseVelocityMagnitude = vectorMagnitude(baseVelocity);

  this.velocity = forXAndY([baseVelocity], function(b) {
    return b * (1 + (Math.random() - 0.5) * baseVelocityMagnitude * 0.2);
  });
}
extend(Mass, Exhaust);

Exhaust.prototype.isWorthDestroying = function() {
  return (this.velocity.x < 0.001 && this.velocity.y < 0.001);
};

Exhaust.prototype.draw = function() {
  ctx.strokeStyle = this.color;
  var endOfStroke = forXAndY([this.position, this.velocity], function(p, v) {
    return p + (v * 5);
  });

  ctx.beginPath();
  ctx.moveTo(this.position.x, this.position.y);
  ctx.lineTo(endOfStroke.x, endOfStroke.y);
  ctx.stroke();
  ctx.closePath();
};



/* THE GAME */
function Game() {
  var self = this;
  game = self;

  self.timeElapsed = 0;
  self.baseSpeed = 0.4;
  self.slowSpeed = self.baseSpeed / 100;
  self.speed = self.baseSpeed;

  var enemies = [];

  var tether = new Tether();
  var player = new Player(tether);
  var cable = new Cable(tether, player);

  window.addEventListener('mousedown', function() {
    ctx.canvas.classList.add('showcursor');
    tether.locked = true;
    self.speed = self.slowSpeed;
  });

  window.addEventListener('mouseup', function() {
    // XXX do not resume until the cursor is near the tether and if it is,

    if (!self.ended) {
      ctx.canvas.classList.remove('showcursor');
      tether.locked = false;
      self.speed = self.baseSpeed;
    }
  });

  self.step = function() {
    self.spawnEnemies();
    tether.step();
    player.step();

    for (var i = 0; i < enemies.length; i++) {
      enemies[i].step();
    }

    if (!self.ended) {
      self.checkForCableContact();
      self.checkForEnemyContact();
    }

    self.timeElapsed += self.speed;

    self.draw();
  };

  self.spawnEnemies = function() {
    if (Math.random() < 0.02 * game.speed) {
      enemies.push(new Idiot(player));
    }
  };

  self.checkForCableContact = function() {
    var cableAreaCovered = cable.areaCoveredThisStep();

    for (var i = 0; i < enemies.length; i++) {
      var enemy = enemies[i];
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
    for (var i = 0; i < enemies.length; i++) {
      var enemy = enemies[i];
      if (enemy.died) {
        continue;
      }

      if (
        vectorMagnitude(lineDelta([enemy.position, mass.position])) <
        (enemy.radius + mass.radius)
      ) {
        player.die();
      }
    }
  };

  self.checkForEnemyContact = function() {
    self.checkForEnemyContactWith(tether);
    self.checkForEnemyContactWith(player);
  };

  self.draw = function() {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.fillStyle = '#000';
    ctx.fillText(self.timeElapsed.toFixed(2), 6, 20);

    for (var i = 0; i < enemies.length; i++) {
      enemies[i].draw();
    }

    cable.draw();
    tether.draw();
    player.draw();
  };

  self.end = function() {
    ctx.canvas.classList.add('showcursor');
    self.ended = true;
    tether.locked = true;
    self.speed = self.slowSpeed;
  };
}

/* FIRE */
initCanvas();
game = new Game();
setInterval(game.step, 10);
