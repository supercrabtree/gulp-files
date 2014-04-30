'use strict';

/*global shell */
/*global $ */
require('shellscript').globalize();


var gulp      = require('gulp')
  , gutil     = require('gulp-util')
  , rimraf    = require('gulp-rimraf')
  , sass      = require('gulp-ruby-sass')
  , jshint    = require('gulp-jshint')
  , prefix    = require('gulp-autoprefixer')
  , plumber   = require('gulp-plumber')
  , ngmin     = require('gulp-ngmin')
  , gulpShell = require('gulp-shell')

  , tinylr    = require('tiny-lr-quiet')
  , fs        = require('fs')
  , nodemon   = require('nodemon')
  , http      = require('http')
  , openURL   = require('open')
  , inquirer  = require('inquirer');

var HTTP_HOST = 'localhost';
var HTTP_PORT = process.env.PORT = 9000;
var NODE_APP_READY_TEST_PATH = '/api/clients/all';
var LIVERELOAD_PORT = 35729;
var lr = tinylr();
lr.listen(LIVERELOAD_PORT);

// ///////////////////////////////////////////////
// /////////// Helper Methods ////////////////////
// ///////////////////////////////////////////////
function err() {
  /*jshint validthis:true */
  gutil.beep();
  this.emit('end');
}
function onNodeServerLog(log) {
  console.log(gutil.colors.white('[') + gutil.colors.yellow('nodemon') + gutil.colors.white('] ') + log.message);
}
function onNodeServerRestart(files) {
  waitForNode(reload, [{path: files[0]}]);
}
function onNodeServerStart() {
  console.log('[\x1B[33mnodemon\x1B[0m] waiting for route \x1B[31m' + NODE_APP_READY_TEST_PATH + '\x1B[0m to return successfully');
}
function waitForNode(callback, params) {
  setTimeout(function () {
    http.get({
      host: HTTP_HOST,
      port: HTTP_PORT,
      path: NODE_APP_READY_TEST_PATH
    }, function () {
      callback.apply(callback, params);
    }).on('error', function () {
      waitForNode(callback, params);
    });
  }, 100);
}
function errBuild(err) {
  gutil.beep();
  console.log(gutil.colors.red('✖ Build Failed'));
  process.exit(1);
}
function reload(file) {
  var log = '[\x1B[31mLiveReload\x1B[0m]';
  if (file) {
    log += ' ' + file.path;
  }
  console.log(log);
  file = file || {path: 'app/scripts/app.js'};
  lr.changed({body: {files: file.path}});
}




///////////////////////////////////////////////
/////////// SERVE / WATCH / RELOAD ////////////
///////////////////////////////////////////////
gulp.task('default', ['serve']);
gulp.task('go', ['serve', 'launchProject']);
gulp.task('serve', ['gulpfile', 'cleanTmp', 'sass', 'serverJs', 'clientJs', 'runMongo', 'startNode', 'runMongo', 'watch'], function () {
  reload(); // TODO: make this work consistantly
});

gulp.task('gulpfile', function () {
  return gulp.src('gulpfile.js')
    .pipe(jshint('.jshintrcnode'))
    .pipe(jshint.reporter('jshint-stylish'))
    .pipe(jshint.reporter('fail'))
    .on('error', err);
});

gulp.task('cleanTmp', function () {
  return gulp.src('.tmp/styles/*', {read: false})
    .pipe(rimraf());
});

gulp.task('sass', ['cleanTmp'], function () {
  return gulp.src('app/styles/main.scss')
    .pipe(plumber())
    .pipe(sass({loadPath: ['app/bower_components']}))
    .on('error', err)
    .pipe(prefix('last 2 versions'))
    .pipe(gulp.dest('.tmp/styles'));
});

gulp.task('serverJs', function () {
  return gulp.src(['server/**/*.js', 'server.js'])
    .pipe(jshint('.jshintrcnode'))
    .pipe(jshint.reporter('jshint-stylish'))
    .pipe(jshint.reporter('fail'))
    .on('error', err);
});

gulp.task('clientJs', function () {
  return gulp.src('app/scripts/**/*.js')
    .pipe(jshint('.jshintrc'))
    .pipe(jshint.reporter('jshint-stylish'))
    .pipe(jshint.reporter('fail'))
    .on('error', err);
});


gulp.task('startNode', ['gulpfile', 'cleanTmp', 'sass', 'clientJs', 'serverJs', 'runMongo'], function (callback) {
  nodemon('server.js --watch server --watch server.js --ignore node_modules/')
    .on('restart', onNodeServerRestart)
    .on('log', onNodeServerLog)
    .on('start', onNodeServerStart);

  waitForNode(callback);
});

gulp.task('runMongo', function (callback) {
  $('mongod &');
  callback();
});

gulp.task('launchProject', ['startNode'], function () {
  openURL('http://' + HTTP_HOST + ':' + HTTP_PORT);
});

gulp.task('watch', ['sass', 'serverJs', 'clientJs'], function () {

  gulp.watch([
    'app/views/**/*.html',
    'app/scripts/**/*.js',
    'app/images/**/*.*',
    '.tmp/styles/**/*.css'
  ], reload);

  gulp.watch('app/styles/**/*.scss', ['sass']);
  gulp.watch('app/scripts/**/*.js', ['clientJs']);
  gulp.watch(['server/**/*.js', 'server.js'], ['serverJs']);

  gulp.watch('Gulpfile.js', function (event, err) {
    gutil.beep();
    console.log(gutil.colors.red('\n------------------------\nRestart the Gulp process\n------------------------'));
    process.kill();
  });
});




///////////////////////////////////////////////
/////////// BUILD /////////////////////////////
///////////////////////////////////////////////
gulp.task('buildBase', ['gulpfile:dist', 'cleanDist', 'sass:build', 'serverJs:dist', 'clientJs:dist', 'bowerComponents', 'heroku', 'favicon', 'images', 'views']);
gulp.task('build', ['buildBase'], function (callback) {
  console.log(gutil.colors.green('\n✔ Build Success\n'));
  inquirer.prompt([{type: 'confirm', default:false, name: 'wantsLaunch', message: 'Would you like to run your build?'}], function (answers) {
    console.log();
    if (answers.wantsLaunch) {
      process.env.NODE_ENV = 'production';
      $('npm install');
      $('node dist/server.js');
      callback();
      process.exit(0); // hmmm buggy, shouldn't have to do that
    } else {
      callback();
      process.exit(0); // hmmm buggy, shouldn't have to do that
    }
  });
});

gulp.task('gulpfile:dist', function () {
  return gulp.src('gulpfile.js')
    .pipe(jshint('.jshintrcnode'))
    .pipe(jshint.reporter('jshint-stylish'))
    .pipe(jshint.reporter('fail'))
    .on('error', errBuild);
});

gulp.task('cleanDist', function () {
  return gulp.src(['dist/*', '!dist/.git'], {read: false})
    .pipe(rimraf());
});

gulp.task('sass:build', ['cleanDist'], function () {
  return gulp.src('app/styles/main.scss')
    .pipe(sass({loadPath: ['app/bower_components']}))
    .on('error', errBuild)
    .pipe(prefix('last 2 versions'))
    .pipe(gulp.dest('dist/public/styles'));
});

gulp.task('serverJs:dist', ['cleanDist'], function () {
  return gulp.src(['server.js', 'server/**/*.*'], {base: './'})
    .pipe(jshint('.jshintrcnode'))
    .pipe(jshint.reporter('jshint-stylish'))
    .pipe(jshint.reporter('fail'))
    .on('error', errBuild)
    .pipe(gulp.dest('dist'));
});

gulp.task('clientJs:dist', ['cleanDist'], function () {
  return gulp.src('app/scripts/**/*.js')
    .pipe(jshint('.jshintrc'))
    .pipe(jshint.reporter('jshint-stylish'))
    .pipe(jshint.reporter('fail'))
    .on('error', err)
    .pipe(ngmin())
    .pipe(gulp.dest('dist/public/scripts'));
});

gulp.task('bowerComponents', ['cleanDist'], function () {
  return gulp.src('app/bower_components/**/*.*')
    .pipe(gulp.dest('dist/public/bower_components'));
});

gulp.task('heroku', ['cleanDist'], function () {
  return gulp.src(['Procfile', 'package.json'])
    .pipe(gulp.dest('dist'));
});

gulp.task('images', ['cleanDist'], function () {
  return gulp.src('app/images/**/*.*')
    .pipe(gulp.dest('dist/public/images'));
});

gulp.task('favicon', ['cleanDist'], function () {
  return gulp.src('app/favicon.ico')
    .pipe(gulp.dest('dist/public/'));
});

gulp.task('views', ['cleanDist'], function () {
  return gulp.src('app/views/**/*.html')
    .pipe(gulp.dest('dist/views'));
});




///////////////////////////////////////////////
/////////// DEPLOY ////////////////////////////
///////////////////////////////////////////////
gulp.task('deploy', ['buildBase'], function (callback) {
  console.log(gutil.colors.green('\n✔ Build Success\n'));

  var lastCommitHash = $('git log -1 --pretty=%h');
  var lastCommitMessage = $('git log -1 --pretty=%B');

  var defaultCommit = '';
  lastCommitHash && ( defaultCommit += lastCommitHash.match(/[^$\n+]+/)[0] + ' ');
  lastCommitMessage && (defaultCommit += '(' + lastCommitMessage.match(/[^$\n+]+/)[0] + ') ');

  inquirer.prompt([
    {type: 'input', name: 'commitMessage', message: 'Write a commit message: ' + defaultCommit, filter: function (input) {
      return defaultCommit + input;
    }},
    {type: 'confirm', name: 'wantsLogs', message: 'Do you wanna see the logs?'}
    ], function (answers) {

      process.chdir('./dist');

      var commands = [
        'git add -A .',
        'git commit -m "' + answers.commitMessage + '"',
        'git push heroku master'
      ];
      answers.wantsLogs && commands.push('heroku logs -t');
      gulp.src('')
        .pipe(gulpShell(commands))
        .on('error', function (err) {
          //console.log(err.stack);
          process.exit(1);
        });
      console.log();
      callback();
  });
});