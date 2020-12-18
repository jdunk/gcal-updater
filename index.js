const express = require("express");
const app = express();
const { google } = require('googleapis');
const config = require('./config/default.js')

const scopes = ['https://www.googleapis.com/auth/calendar']

const auth = new google.auth.GoogleAuth({
  keyFile: './gauth.json',
  scopes,
})

const gcal = google.calendar({ version: 'v3', auth })

const getStartOfToday = (offsetInMinutes) => {
  const now = new Date();
  const adjNow = new Date(now.getTime() + offsetInMinutes * 60000);

  return new Date(Date.UTC(1900 + adjNow.getYear(), adjNow.getMonth(), adjNow.getDate(), -offsetInMinutes/60));
};

const getStartOfTomorrow = (offsetInMinutes) => {
  const now = new Date();
  const adjNow = new Date(now.getTime() + offsetInMinutes * 60000);

  return new Date(Date.UTC(1900 + adjNow.getYear(), adjNow.getMonth(), adjNow.getDate(), -offsetInMinutes/60, 1));
};

const toTwoDigits = num => String(num).padStart(2, '0');

const getTodaysDate = (offsetInMinutes) => {
  const adjNow = new Date((new Date()).getTime() + offsetInMinutes * 60000);

  return `${1900 + adjNow.getYear()}-${toTwoDigits(1 + adjNow.getMonth())}-${toTwoDigits(adjNow.getDate())}`;
};

const getTomorrowsDate = (offsetInMinutes) => {
  const adjNow = new Date((new Date()).getTime() + offsetInMinutes * 60000);

  const nextDay = new Date(Date.UTC(1900 + adjNow.getYear(), adjNow.getMonth(), adjNow.getDate()+1));
  return `${1900 + nextDay.getYear()}-${toTwoDigits(1 + nextDay.getMonth())}-${toTwoDigits(nextDay.getDate())}`;
};

const getCurrentEventFromGCalEventsList = (resp, thingName) => {
  // console.log(resp.data.items) // All data
  /*
  const events = resp.data.items.map((ev) => ({
    id: ev.id,
    summary: ev.summary,
    start: ev.start.dateTime || ev.start.date,
    description: ev.description,
  }));

  console.log(events)
  */

  let currEv = null;

  resp.data.items.forEach((ev) => {
    const indexOfFirstSpace = ev.summary.indexOf(' ');

    if (indexOfFirstSpace === -1) return;

    if (ev.summary.substr(1 + indexOfFirstSpace) === thingName) {
      currEv = {
        ...ev,
        count: parseInt(ev.summary.substr(0, indexOfFirstSpace), 10) || 0,
      };
    }
  });

  return currEv;
};

const getCurrEvent = (thingName) => {
  return new Promise((resolve, reject) => {
  
    gcal.events.list(
      {
        calendarId: config.calendarId,
        timeMin: getStartOfToday(config.timezoneOffsetInMinutes).toISOString(),
        timeMax: getStartOfTomorrow(config.timezoneOffsetInMinutes).toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      },
      (err, resp) => {
        if (err) {
          reject(new Error(`The API returned an error: ${err}`));
        }

        resolve(getCurrentEventFromGCalEventsList(resp, thingName));
      }
    );
  });
};

const createGCalEvent = (num, thingName) => {
  return new Promise((resolve, reject) => {
    gcal.events.insert(
      {
        calendarId: config.calendarId,
        resource: {
          start: {
            date: getTodaysDate(config.timezoneOffsetInMinutes),
          },
          end: {
            date: getTomorrowsDate(config.timezoneOffsetInMinutes),
          },
          colorId: config.defaultEventColorId,
          summary: `${num} ${thingName}`,
          description: num
        }
      },
      (err, resp) => {
        if (err) {
          reject(new Error(`The API returned an error: ${err}`));
        }

        resolve(resp);
      }
    );
  });
};

const updateGCalEvent = (eventToUpdate, num, thingName) => {
  return new Promise((resolve, reject) => {
    gcal.events.update(
      {
        calendarId: config.calendarId,
        eventId: eventToUpdate.id,
        resource: {
          ...eventToUpdate,
          summary: `${num + eventToUpdate.count} ${thingName}`,
          description: !eventToUpdate.description ? num : `${eventToUpdate.description}+${num}`,
        },
      },
      (err, resp) => {
        if (err) {
          reject(new Error(`The API returned an error: ${err}`));
        }

        resolve(resp);
      }
    );
  });
};

const addToCurrTotal = async (currEvent, num, thingName) => {
  if (!currEvent) {
    const newEvent = await createGCalEvent(num, thingName);
    return newEvent;
  }

  const updatedEvent = await updateGCalEvent(currEvent, num, thingName);
  return updatedEvent;
};

app.get('/get/:thing', (req, res, next) => {
  getCurrEvent(req.params.thing)
    .then(currEvent => {
      res.send({
        count: currEvent && currEvent.count ? currEvent.count : 0
      });
    })
    .catch(err => {
      console.error(err);
      res.status(500).send(err.toString());
    });
});

app.get('/add/:num/:thing', (req, res, next) => {
  // Validate input
  const numParamRaw = req.params.num;
  const numParamTypecast = parseInt(req.params.num, 10);

  if (!numParamTypecast || numParamTypecast < 1) {
    res.status(400).send(`"${numParamRaw}" is not a valid number to add`);
    return;
  }

  getCurrEvent(req.params.thing)
    .then(currEvent => 
      addToCurrTotal(
        currEvent,
        numParamTypecast,
        req.params.thing
      )
    )
    .then(resp => {
      res.send({
        count: parseInt(resp.data.summary.substr(0, resp.data.summary.indexOf(' ')), 10),
        summary: resp.data.summary,
        description: resp.data.description,
      });
    })
    .catch(err => {
      console.error(err);
      res.status(500).send(err.toString());
    });
});

app.get('/', (req, res, next) => {
  res.send('Endpoints: /get/:thingName, /add/:num/:thingName');
});

app.listen(config.serverPort, () => {
  console.log(`Server running on ${config.serverPort}`);
});