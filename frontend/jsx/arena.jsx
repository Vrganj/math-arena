import React from 'react';
import ReactDOM from 'react-dom';
import axios from 'axios';

import gateway from 'js/gateway';

class Arena extends React.Component {

    constructor(props) {
        super(props);

        this.state = {
            ping: 0,
            uuid: null,
            name: null,
            field: {
                x: 2000,
                y: 2000,
            },
            players: {},
            problems: [],
        };

        this.process_feed = this.process_feed.bind(this);
        this.handle_mouse = this.handle_mouse.bind(this);
    }

    componentDidMount() {
        this.process_feed();

        this.refs.arena.focus();
    }

    componentWillUnmount() {
        this.gateway.stop();
    }

    process_feed() {
        this.gateway = new gateway();

        this.gateway.feed(msg => {
            let data = JSON.parse(msg);
            let { code, payload } = data;

            switch (code) {
                case 'ping':
                    this.setState({
                        ping: payload.ping
                    });
                    break;
                case 'register':
                    this.setState({
                        uuid: payload.uuid
                    });
                    this.gateway.send({
                        code: 'set_name',
                        payload: {
                            name: this.props.name.substring(0, 16)
                        }
                    });
                    break;
                case 'player_state':
                    if (!payload.players[this.state.uuid]) {
                        break;
                    }

                    this.setState({
                        field: {
                            x: payload.players[this.state.uuid].pos.x,
                            y: payload.players[this.state.uuid].pos.y,
                        },
                        players: payload.players
                    });
                    break;
                case 'problem_state':
                    this.setState({
                        problems: payload.problems,
                    });

                    break;
            }
        });

        this.gateway.start();
    }

    handle_mouse({ pageX: x, pageY: y }) {
        x -= document.documentElement.clientWidth / 2;
        y -= document.documentElement.clientHeight / 2;
        const angle = Math.atan2(y, x);

        this.gateway.send({
            code: 'movement',
            payload: {
                angle,
            },
        });
    }

    render() {
        return (
            <div
                class="ma-arena"
                ref="arena"
                tabIndex={-1}
                onMouseMove={this.handle_mouse}>

                <div class="ping">
                    {this.state.ping}ms
                    <br />
                    {this.state.field.x} 
                    <br />
                    {this.state.field.y}
                </div>
                <div
                    class="field"
                    style={{
                        transform: `translate(${-this.state.field.x}px, ${-this.state.field.y}px)`,
                        willChange: 'transform',
                    }}>
                <div className="problems">
                    {this.state.problems.map(problem => {
                        return (
                            <div
                            key={problem.id}
                            class="problem"
                            style={{
                                top: `${problem.pos.y}px`,
                                left: `${problem.pos.x}px`,
                            }}>
                            </div>
                        )
                    })}
                </div>

                </div>
                <div class="players">
                    {Object.keys(this.state.players).map(key => {
                        let player = this.state.players[key];

                        if (player.uuid === this.state.uuid) {
                            return null;
                        }

                        return (
                            <div
                                key={player.uuid}
                                class="player-remote"
                                style={{
                                    top: `${player.pos.y - this.state.field.y + document.documentElement.clientHeight / 2 - 40}px`,
                                    left: `${player.pos.x - this.state.field.x + document.documentElement.clientWidth / 2 - 40}px`,
                                }}>

                                <div class="name">{player.name}</div>
                                <div class="points">0</div>
                            </div>
                        );
                    })}
                </div>

                <div class="player-local">
                    <div class="name">{this.props.name}</div>
                    <div class="points">0</div>
                </div>
            </div>
        )
    }

}

export default Arena;
