export class TodosStore {
  constructor() {
    this.todos = new Map();
    this.currentId = 1;

    // Seed some initial data bound to userIds
    this.create({ title: "Build Todo Microservice using BauaJS", userId: 101, completed: false });
    this.create({ title: "Verify metrics and tracing", userId: 102, completed: false });
    this.create({ title: "Celebrate framework success", userId: 101, completed: true });
  }

  getAll(filterCompleted) {
    const list = Array.from(this.todos.values());
    if (filterCompleted === undefined) {
      return list;
    }
    return list.filter(todo => todo.completed === filterCompleted);
  }

  get(id) {
    return this.todos.get(id);
  }

  create({ title, userId, completed = false }) {
    const id = this.currentId++;
    const todo = {
      id,
      title,
      userId,
      completed,
      createdAt: new Date().toISOString()
    };
    this.todos.set(id, todo);
    return todo;
  }

  update(id, { title, userId, completed }) {
    const todo = this.todos.get(id);
    if (!todo) return null;

    if (title !== undefined) todo.title = title;
    if (userId !== undefined) todo.userId = userId;
    if (completed !== undefined) todo.completed = completed;
    todo.updatedAt = new Date().toISOString();

    this.todos.set(id, todo);
    return todo;
  }

  delete(id) {
    return this.todos.delete(id);
  }

  clear() {
    this.todos.clear();
    this.currentId = 1;
  }
}

export const store = new TodosStore();
