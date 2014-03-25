// XXX FUCK EVENTS

var game;
var ctx;
var speed = 0.4;

/* UTILITIES */
function forXAndY(obj1, obj2, func) {
  return {
    x: func(obj1.x, obj2.x),
    y: func(obj1.y, obj2.y)
  };
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

/* GAME OBJECTS */
function Tether() {
  var self = this;
  self.mass = new Mass();

  self.draw = function() {
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(self.mass.position.x, self.mass.position.y, 10, 0, Math.PI*2);
    ctx.closePath();
    ctx.fill();
  };

  document.addEventListener('mousemove', function(e) {
    if (e.target === ctx.canvas) {
      self.mass.position = {x: e.layerX, y: e.layerY};
    }
  });

  return true;
}

function Mass(opts) {
  // The basic object of our physics engine. An object with mass, position, velocity and forces.
  var self = this;
  opts = opts || {};

  var defaults = {
    velocity: {x: 0, y: 0},
    position: {x: 0, y: 0},
    force: {x: 0, y: 0},
    mass: 1,
    friction: 0
  };

  for (var attr in defaults) {
    self[attr] = opts[attr] || defaults[attr];
  }

  positionOnPreviousFrame = self.position;

  document.addEventListener('poststep', function() {
    self.positionOnPreviousFrame = self.position;
  });

  self.reactToVelocity = function () {
    // set position based on velocity
    self.position = forXAndY(self.position, self.velocity, function(pos, vel) {
      return pos + (vel * speed);
    });
  };

  self.reactToForce = function() {
    // set velocity and position based on force
    self.velocity = forXAndY(self.velocity, self.force, function(vel, force) {
      return (vel + (force / self.mass)) * (1 - (self.friction * speed));
    });
    self.reactToVelocity();
  };

  return true;
}

function Ship(tether) {
  var self = this;
  self.mass = new Mass({
    mass: 100,
    friction: 0.02
  });

  self.draw = function() {
    ctx.fillStyle = '#FF0000';
    ctx.beginPath();
    ctx.arc(self.mass.position.x, self.mass.position.y, 10, 0, Math.PI*2);
    ctx.closePath();
    ctx.fill();
  };

  self.move = function() {
    self.mass.force = forXAndY(tether.mass.position, self.mass.position, function(tpos, mpos) {
      return tpos - mpos;
    });

    self.mass.reactToForce();
  };

  document.addEventListener('prestep', self.move);

  return true;
}

function Cable(tether, ship) {
  var self = this;

  self.draw = function() {
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(20, 20, 200, 1)';
    ctx.moveTo(tether.mass.position.x, tether.mass.position.y);
    ctx.lineTo(ship.mass.position.x, ship.mass.position.y);
    ctx.stroke();
    ctx.closePath();
  };
}

function Game() {
  var self = this;
  game = self;
  var tether = new Tether();
  var ship = new Ship(tether);
  var cable = new Cable(tether, ship);

  var preStep = new Event('prestep');
  var postStep = new Event('poststep');

  self.step = function() {
    document.dispatchEvent(preStep);
    self.draw();
    document.dispatchEvent(postStep);
  };

  self.draw = function() {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    cable.draw();
    tether.draw();
    ship.draw();
  };

  return true;
}

/* FIRE */
initCanvas();
new Game();
setInterval(game.step, 10);
