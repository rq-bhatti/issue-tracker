'use strict';

const { MongoClient, ObjectId } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/fcc-issuetracker';
const client = new MongoClient(MONGO_URI);
const dbPromise = client.connect().then(c => c.db());

async function issues() {
  const db = await dbPromise;
  return db.collection('issues');
}

const FIELDS = ['issue_title', 'issue_text', 'created_by', 'assigned_to', 'status_text'];

function toObjectId(id) {
  try {
    return ObjectId.isValid(String(id)) && String(id).length === 24 ? new ObjectId(String(id)) : null;
  } catch (e) {
    return null;
  }
}

function toBool(v) {
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  return undefined;
}

function format(doc) {
  const { project, ...rest } = doc;
  return rest;
}

module.exports = function (app) {

  app.route('/api/issues/:project')

    .get(async function (req, res) {
      const project = req.params.project;
      try {
        const filter = { project };
        for (const [key, value] of Object.entries(req.query)) {
          if (key === '_id') {
            const oid = toObjectId(value);
            if (!oid) return res.json([]);
            filter._id = oid;
          } else if (key === 'open') {
            const b = toBool(value);
            filter.open = b === undefined ? value : b;
          } else if (key === 'created_on' || key === 'updated_on') {
            filter[key] = new Date(value);
          } else if (key !== 'project') {
            filter[key] = value;
          }
        }
        const col = await issues();
        const docs = await col.find(filter).toArray();
        res.json(docs.map(format));
      } catch (e) {
        res.json({ error: 'could not get issues' });
      }
    })

    .post(async function (req, res) {
      const project = req.params.project;
      const body = req.body || {};
      const { issue_title, issue_text, created_by } = body;
      if (!issue_title || !issue_text || !created_by) {
        return res.json({ error: 'required field(s) missing' });
      }
      const now = new Date();
      const doc = {
        issue_title,
        issue_text,
        created_by,
        assigned_to: body.assigned_to || '',
        status_text: body.status_text || '',
        created_on: now,
        updated_on: now,
        open: true,
        project
      };
      try {
        const col = await issues();
        const result = await col.insertOne(doc);
        doc._id = result.insertedId;
        res.json(format(doc));
      } catch (e) {
        res.json({ error: 'could not create issue' });
      }
    })

    .put(async function (req, res) {
      const project = req.params.project;
      const body = req.body || {};
      const _id = body._id;
      if (!_id) return res.json({ error: 'missing _id' });

      const update = {};
      for (const f of FIELDS) {
        if (body[f] !== undefined && body[f] !== '') update[f] = body[f];
      }
      if (body.open !== undefined && body.open !== '') {
        const b = toBool(body.open);
        if (b !== undefined) update.open = b;
      }
      if (Object.keys(update).length === 0) {
        return res.json({ error: 'no update field(s) sent', _id });
      }

      const oid = toObjectId(_id);
      if (!oid) return res.json({ error: 'could not update', _id });
      update.updated_on = new Date();
      try {
        const col = await issues();
        const result = await col.updateOne({ _id: oid, project }, { $set: update });
        if (result.matchedCount === 0) return res.json({ error: 'could not update', _id });
        res.json({ result: 'successfully updated', _id });
      } catch (e) {
        res.json({ error: 'could not update', _id });
      }
    })

    .delete(async function (req, res) {
      const project = req.params.project;
      const body = req.body || {};
      const _id = body._id;
      if (!_id) return res.json({ error: 'missing _id' });
      const oid = toObjectId(_id);
      if (!oid) return res.json({ error: 'could not delete', _id });
      try {
        const col = await issues();
        const result = await col.deleteOne({ _id: oid, project });
        if (result.deletedCount === 0) return res.json({ error: 'could not delete', _id });
        res.json({ result: 'successfully deleted', _id });
      } catch (e) {
        res.json({ error: 'could not delete', _id });
      }
    });

};
