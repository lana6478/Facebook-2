/// <reference path="../pb_data/types.d.ts" />
// Notifications: remembers when each person last looked at the Wall, each of their
// groups, and their notifications page, so the site can count what's new since then.
//
// One row per person per thing ("wall", "notifs", or a group's id). Completely private:
// nobody can see anyone else's rows, so nobody can tell when you last checked anything.

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");

  const seen = new Collection({
    type: "base",
    name: "seen",
    fields: [
      { type: "relation", name: "user", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "key", required: true, max: 30 },
      { type: "date", name: "at", required: true },
    ],
    indexes: ['CREATE UNIQUE INDEX idx_seen_user_key ON seen ("user", "key")'],
  });

  const MINE = "user = @request.auth.id";
  seen.listRule = MINE;
  seen.viewRule = MINE;
  seen.createRule = MINE;
  seen.updateRule = `${MINE} && @request.body.user:isset = false && @request.body.key:isset = false`;
  seen.deleteRule = MINE;
  app.save(seen);
}, (app) => {
  app.delete(app.findCollectionByNameOrId("seen"));
});
