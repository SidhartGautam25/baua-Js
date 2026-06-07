import { createServer, json } from "bauajs";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const usersDb = {
  101: { id: 101, name: "Alice Gautam", email: "alice@example.com" },
  102: { id: 102, name: "Bob Singh", email: "bob@example.com" }
};

export function startMockServices() {
  const servers = [];

  // 1. User Service Instance 1 (Port 5001)
  const userApp1 = createServer();
  userApp1.get("/users/:id", (req, res) => {
    const id = parseInt(req.params.id, 10);
    console.log(`[User Service Instance 1] Serving request for userId: ${id}`);
    const user = usersDb[id];
    if (!user) {
      res.statusCode = 404;
      return res.json({ error: "User not found" });
    }
    res.json(user);
  });
  userApp1.runServerOn(5001, () => {
    console.log("[User Service Cluster] Instance 1 listening on port 5001");
  });
  servers.push(userApp1);

  // 2. User Service Instance 2 (Port 5002)
  const userApp2 = createServer();
  userApp2.get("/users/:id", (req, res) => {
    const id = parseInt(req.params.id, 10);
    console.log(`[User Service Instance 2] Serving request for userId: ${id}`);
    const user = usersDb[id];
    if (!user) {
      res.statusCode = 404;
      return res.json({ error: "User not found" });
    }
    res.json(user);
  });
  userApp2.runServerOn(5002, () => {
    console.log("[User Service Cluster] Instance 2 listening on port 5002");
  });
  servers.push(userApp2);

  // 3. Flaky Analytics Service (Port 5003)
  const analyticsApp = createServer();
  analyticsApp.use(json());
  
  let isFlaky = false;

  analyticsApp.post("/record", (req, res) => {
    const correlationId = req.headers["x-correlation-id"];
    const traceparent = req.headers["traceparent"];
    
    if (isFlaky) {
      console.log(`[Analytics Service] ✗ Request failed (Simulated Outage). Correlation ID: ${correlationId}`);
      res.statusCode = 500;
      return res.send("Internal Server Error (Simulated)");
    }

    console.log(`[Analytics Service] ✓ Recorded action: "${req.body.action}" for Todo: ${req.body.todoId}. Traceparent: ${traceparent}`);
    res.json({ recorded: true });
  });

  // Endpoint to toggle flaky state dynamically
  analyticsApp.post("/toggle", (req, res) => {
    isFlaky = !isFlaky;
    console.log(`[Analytics Service] Flaky mode toggled. Fails? ${isFlaky}`);
    res.json({ isFlaky });
  });

  analyticsApp.runServerOn(5003, () => {
    console.log("[Analytics Service] Listening on port 5003");
  });
  servers.push(analyticsApp);

  return {
    servers,
    toggleFlaky: (state) => {
      if (state !== undefined) {
        isFlaky = state;
      } else {
        isFlaky = !isFlaky;
      }
      return isFlaky;
    },
    stopAnalytics: async () => {
      console.log("[Test Progress] Stopping Analytics Service specifically...");
      if (analyticsApp.connections) {
        for (const socket of analyticsApp.connections) {
          socket.destroy();
        }
      }
      await new Promise((resolve) => {
        if (analyticsApp.server) {
          analyticsApp.server.close(resolve);
        } else {
          resolve();
        }
      });
    },
    startAnalytics: async (port = 5003) => {
      console.log("[Test Progress] Restarting Analytics Service...");
      // Re-create server if closed
      analyticsApp.server = null; 
      analyticsApp.runServerOn(port, () => {
        console.log(`[Analytics Service] Restarted and listening on port ${port}`);
      });
      await delay(100);
    },
    stop: async () => {
      console.log("Shutting down mock services...");
      for (const srv of servers) {
        if (srv.connections) {
          for (const socket of srv.connections) {
            socket.destroy();
          }
        }
        await new Promise((resolve) => {
          if (srv.server && srv.server.listening) {
            srv.server.close(resolve);
          } else {
            resolve();
          }
        });
      }
      console.log("Mock services shutdown complete.");
    }
  };
}
