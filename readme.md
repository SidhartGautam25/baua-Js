# basic-tiny-server

basic-tiny-server is a minimalist nodejs library

## Installation

Use the package manager npm to install basic-tiny-server.

```bash
npm install basic-tiny-server
```

## Usage

```js
import { createServer } from "basic-tiny-server";

const server = createServer();
// rotuing and middleware stuff

server.runServerOn(8000, () => {
  console.log("server is listening on port 8000");
});
```

## Contributing

Pull requests are welcome. For major changes, please open an issue first
to discuss what you would like to change.

Please make sure to update tests as appropriate.
