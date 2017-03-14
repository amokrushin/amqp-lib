const test = require('tape');
const Amqp = require('../lib/Amqp');

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

const amqp1 = new Amqp(settings, options);
const amqp2 = new Amqp(settings, options);
const amqp3 = new Amqp(settings, options);

test('constructor', (t) => {
    t.doesNotThrow(() => {
        const amqp = new Amqp(settings, options);
        amqp.close();
    });
    t.end();
});

test('queue', (t) => {
    const reqData = { a: 1 };
    const resData = { b: 2 };
    amqp1.onQueue('test-queue', { ack: true }, (req, res) => {
        t.deepEqual(req, reqData, 'request 1 match');
        setTimeout(() => {
            res(resData);
        }, 100);
    });
    amqp2.onQueue('test-queue', { ack: true }, (req, res) => {
        t.deepEqual(req, reqData, 'request 2 match');
        setTimeout(() => {
            res(resData);
        }, 100);
    });
    amqp3.queue('test-queue', {}, reqData, (res) => {
        t.deepEqual(res, resData, 'response 1 match');
    });
    amqp3.queue('test-queue', {}, reqData, (res) => {
        t.deepEqual(res, resData, 'response 2 match');
        t.end();
    });
});

test('broadcast', (t) => {
    const reqData = { a: 1 };
    const resData = { b: 2 };
    amqp1.onBroadcast('test-broadcast', (req, res) => {
        t.deepEqual(req, reqData, 'request 1 match');
        res(resData);
    });
    amqp2.onBroadcast('test-broadcast', (req, res) => {
        t.deepEqual(req, reqData, 'request 2 match');
        res(resData);
    });
    amqp3.broadcast('test-broadcast', { timeout: 10000, max: 2 }, reqData, (res) => {
        t.deepEqual(res, [resData, resData], 'response match');
        t.end();
    });
});

test('after', (t) => {
    setTimeout(() => {
        amqp1.close();
        amqp2.close();
        amqp3.close();
        t.end();
    }, 200);
});
