/// <reference path="../pb_data/types.d.ts" />
// Sets up the database for the Wall. PocketBase runs this automatically the
// first time it starts with this folder next to it.

migrate((app) => {
  // Let anyone see user *names* so posts can show who wrote them.
  // Email addresses stay hidden (PocketBase hides them unless a user opts in).
  const users = app.findCollectionByNameOrId("users");
  users.listRule = "";
  users.viewRule = "";
  app.save(users);

  const posts = new Collection({
    type: "base",
    name: "posts",
    // Anyone can read the Wall.
    listRule: "",
    viewRule: "",
    // Only logged-in users can post, and only as themselves.
    createRule: "@request.auth.id != '' && author = @request.auth.id",
    // People can only edit or delete their own posts, and can't hand them to someone else.
    updateRule: "author = @request.auth.id && (@request.body.author:isset = false || @request.body.author = @request.auth.id)",
    deleteRule: "author = @request.auth.id",
    fields: [
      { type: "text", name: "body", required: true, max: 5000 },
      { type: "relation", name: "author", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { type: "autodate", name: "created", onCreate: true, onUpdate: false },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE INDEX idx_posts_created ON posts (created)"],
  });
  app.save(posts);
}, (app) => {
  app.delete(app.findCollectionByNameOrId("posts"));
  const users = app.findCollectionByNameOrId("users");
  users.listRule = "id = @request.auth.id";
  users.viewRule = "id = @request.auth.id";
  app.save(users);
});
