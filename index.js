const request = require("request");
const schedule = require('node-schedule');
const R = require('ramda');
const mongodb = require('mongodb')

const renameKeys = require('./utils/renameKeys');

// INIT
const NEST_AUTH_TOKEN = process.env.NEST_AUTH_TOKEN;
if (!NEST_AUTH_TOKEN){
  throw new Error('Nest auth token is required');
}

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI){
  throw new Error('Mongo uri is required');
}

MongoClient = mongodb.MongoClient
MongoClient.connect(MONGO_URI, function (err, db) {
  if (err){ throw new Error(err) }

  const metricsCollection = db.collection('metrics')

  schedule.scheduleJob('* * * * *', function () {
    const hour = new Date();
    const minute = hour.getMinutes();
    hour.setMinutes(0);
    hour.setSeconds(0);
    hour.setMilliseconds(0);

    gatherMetrics(function (err, metrics) {
      if (err){ throw new Error(err); }
      Object.keys(metrics).forEach(function (name) {
        const value = metrics[name];
        metricsCollection.updateOne(
          {
            timestamp_hour: hour,
            type: name,
          },
          { $set: {
            type: name,
            timestamp_hour: hour,
            [`values.${minute}`]: value
          }},
          {
            upsert: true,
          }
        )

      })
    })
  });
})



function fetchNestState(clb) {
  var options = {
    method: 'GET',
    url: 'https://developer-api.nest.com/',
    headers: {
      'cache-control': 'no-cache',
      authorization: `Bearer ${NEST_AUTH_TOKEN}`
    }
  };

  request(options, function (error, response, body) {
    if (error) {
      clb(error)
    }
    clb(null, JSON.parse(body))
  });
}

thermostatProjectionConfig = {
  'humidity'                  : 'livingroom_humidity',             // 50
  'ambient_temperature_c'     : 'livingroom_temperature',          // 20,
  'is_online'                 : 'nest_is_online',                  // true,
  'hvac_state'                : 'hvac_state',                      // 'off'
  'has_leaf'                  : 'nest_has_leaf',                   // false
  'target_temperature_c'      : 'nest_target_temperature' ,        // 19,
  'target_temperature_high_c' : 'nest_target_temperature_high',    // 24,
  'target_temperature_low_c'  : 'nest_target_temperature_low',     // 20,
  'away_temperature_high_c'   : 'nest_away_temperature_high',      // 24,
  'away_temperature_low_c'    : 'nest_away_temperature_low',       // 10,
}

homeProjectionConfig = {
  'away': 'presence',
  'eta_begin': 'nest_eta_begin',
}

function createProjectionFunc(config){
  return R.pipe(
    R.pick(R.keys(config)),
    renameKeys(config)
  )
}

const projectThermostatMetrics = createProjectionFunc(thermostatProjectionConfig)
const projectHomeMetrics = createProjectionFunc(homeProjectionConfig)

function gatherMetrics(clb) {
  fetchNestState(function(err, nestState) {
    if (err){ return clb(err) }
    const thermostat = R.values(nestState.devices.thermostats)[0];
    const home = R.values(nestState.structures)[0];

    const thermostatMetrics = projectThermostatMetrics(thermostat)
    const homeMetrics = projectHomeMetrics(home)
    
    const metrics = R.merge(thermostatMetrics, homeMetrics);

    clb(null, metrics)
  })
}

function trackMetrics(metrics, timestamp) {


}
