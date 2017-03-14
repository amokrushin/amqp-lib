const test = require('tape');
const AmqpConnection = require('../lib/AmqpConnection');

const { assign } = Object;
const logger = {
    log() {},
    info() {},
    error() {},
};
const settings = {};
const options = { logger };

if (!process.env.TRAVIS) {
    // eslint-disable-next-line
    assign(process.env, require('../.env'));
}

test('constructor', (t) => {
    const amqp = new AmqpConnection(settings, options);
    t.ok(amqp.connection instanceof Promise, 'instance of Promise');
    amqp.close();
    t.end();
});

test('connection instance', (t) => {
    const amqp = new AmqpConnection(settings, options);
    amqp.connection.then((connectionA) => {
        amqp.connection.then((connectionB) => {
            t.ok(connectionA === connectionB, 'return same connection instance until reconnect');
            amqp.close();
            t.end();
        });
    });
});

test('connection reconnect', (t) => {
    const amqp = new AmqpConnection(settings, options);
    amqp.connection.then((connectionA) => {
        connectionA.close(() => {
            process.nextTick(() => {
                amqp.connection.then((connectionB) => {
                    t.ok(connectionA !== connectionB, 'return another connection instance after reconnect');
                    amqp.close();
                    t.end();
                });
            });
        });
    });
});

test('connection error', (t) => {
    const amqp = new AmqpConnection({ password: 'invalid' }, options);
    amqp.connection
        .then(() => {
            t.fail('connection should not be established');
        });
    amqp.once('error', () => {
        amqp.close();
        t.pass('error emitted');
        t.end();
    });
});
