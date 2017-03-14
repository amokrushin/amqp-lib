const once = require('lodash.once');
const AmqpConnection = require('./AmqpConnection');

const { assign } = Object;

class Amqp extends AmqpConnection {
    constructor(settings, options) {
        super(settings, options);
        this.options = assign(this.options, options || {});
        this._logger = this.options.logger;
    }

    channel(callback) {
        this.connection.then((connection) => {
            connection.createChannel(callback);
        });
    }

    middleware(channel, options, handler) {
        return (msg) => {
            let rmqreq = JSON.parse(msg.content.toString());
            try {
                if (msg.properties.replyTo) {
                    handler(rmqreq, (rmqres) => {
                        channel.sendToQueue(
                            msg.properties.replyTo,
                            new Buffer(JSON.stringify(rmqres))
                        );
                        if (options.ack) {
                            channel.ack(msg);
                        } else {
                            channel.nack(msg);
                        }
                    });
                } else {
                    handler(rmqreq);
                    rmqreq = null;
                }
            } catch (e) {
                this._logger.error(e);
            }
        };
    }

    queue(queue, options, rmqreq, rmqres) {
        this.channel((err, channel) => {
            if (err) return this._logger.error('[AMQP] error', err);

            channel.assertQueue(queue);
            if (rmqres) {
                channel.assertQueue('', { exclusive: true }, (err, q) => {
                    if (err) return this._logger.error('[AMQP] error', err);

                    channel.consume(q.queue, (msg) => {
                        channel.deleteQueue(q.queue);
                        channel.close();
                        rmqres(JSON.parse(msg.content.toString()));
                    }, { noAck: true });

                    channel.sendToQueue(queue, new Buffer(JSON.stringify(rmqreq)), { replyTo: q.queue });
                });
            } else {
                channel.sendToQueue(queue, new Buffer(JSON.stringify(rmqreq)));
                channel.close();
            }
        });
    }

    onQueue(queue, options, handler) {
        this.channel((err, channel) => {
            if (err) return this._logger.error('[AMQP] error', err);
            channel.assertQueue(queue);
            channel.prefetch(options.prefetch || 1);
            channel.consume(queue, this.middleware(channel, options, handler), {
                noAck: !options.ack,
            });
        });
    }

    broadcast(exchange, options, rmqreq, rmqres) {
        this.channel((err, channel) => {
            if (err) return this._logger.error('[AMQP] error', err);
            channel.assertExchange(exchange, 'fanout', { durable: false });
            if (rmqres) {
                channel.assertQueue('', { exclusive: true }, (err, responseQueue) => {
                    if (err) return this._logger.error('[AMQP] error', err);
                    const messages = [];
                    let timerId = null;
                    let consumerTag = null;
                    const response = once(() => {
                        if (consumerTag) {
                            channel.cancel(consumerTag);
                        }
                        clearTimeout(timerId);
                        channel.deleteQueue(responseQueue.queue);
                        channel.close();
                        rmqres(messages);
                    });
                    const onMessage = (msg) => {
                        messages.push(JSON.parse(msg.content.toString()));
                        if (options.max && messages.length === options.max) {
                            response();
                        }
                    };
                    const consumeCb = (err, fields) => {
                        if (err) this._logger.error('[AMQP] error', err);
                        consumerTag = fields.consumerTag;
                    };

                    channel.consume(responseQueue.queue, onMessage, { noAck: true }, consumeCb);
                    channel.publish(exchange, '', new Buffer(JSON.stringify(rmqreq)), { replyTo: responseQueue.queue });

                    timerId = setTimeout(response, options.timeout || 5000);
                });
            } else {
                channel.publish(exchange, '', new Buffer(JSON.stringify(rmqreq)));
                channel.close();
            }
        });
    }

    onBroadcast(exchange, handler) {
        this.channel((err, channel) => {
            if (err) return this._logger.error('[AMQP] error', err);
            channel.assertExchange(exchange, 'fanout', { durable: false });
            channel.assertQueue('', { exclusive: true }, (err, q) => {
                if (err) return this._logger.error('[AMQP] error', err);
                channel.bindQueue(q.queue, exchange, '');

                channel.consume(q.queue, this.middleware(channel, {}, handler), {
                    noAck: true,
                });
            });
        });
    }
}

module.exports = Amqp;
