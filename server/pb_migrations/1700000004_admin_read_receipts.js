/// <reference path="../pb_data/types.d.ts" />
// Read receipts for site admins: admins can *see* everyone's "seen" times
// (used to show who has read each group message). Only you can change your own.

const MINE = "user = @request.auth.id";
const ADMIN = "@request.auth.is_admin = true";

migrate((app) => {
  const seen = app.findCollectionByNameOrId("seen");
  seen.listRule = `${MINE} || ${ADMIN}`;
  seen.viewRule = seen.listRule;
  app.save(seen);
}, (app) => {
  const seen = app.findCollectionByNameOrId("seen");
  seen.listRule = MINE;
  seen.viewRule = MINE;
  app.save(seen);
});
