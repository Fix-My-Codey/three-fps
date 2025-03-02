import * as THREE from 'three'
import Component from '../../Component'
import Input from '../../Input'
import { Ammo } from '../../AmmoLib'

import DebugShapes from '../../DebugShapes'

export default class PlayerControls extends Component {
    constructor(camera) {
        super();
        this.name = 'PlayerControls';
        this.camera = camera;

        this.timeZeroToMax = 0.08;
        this.maxSpeed = 4.0;
        this.speed = new THREE.Vector3();
        this.acceleration = this.maxSpeed / this.timeZeroToMax;
        this.airAcceleration = 1.5; // Reduced air acceleration to mimic CS2 mechanics
        this.decceleration = -7.0;

        this.mouseSpeed = 0.002;
        this.physicsComponent = null;
        this.isLocked = false;

        this.angles = new THREE.Euler();
        this.pitch = new THREE.Quaternion();
        this.yaw = new THREE.Quaternion();

        this.jumpVelocity = 3;
        this.yOffset = 0.5;
        this.tempVec = new THREE.Vector3();
        this.moveDir = new THREE.Vector3();
        this.xAxis = new THREE.Vector3(1.0, 0.0, 0.0);
        this.yAxis = new THREE.Vector3(0.0, 1.0, 0.0);
    }

    Initialize() {
        this.physicsComponent = this.GetComponent("PlayerPhysics");
        this.physicsBody = this.physicsComponent.body;
        this.transform = new Ammo.btTransform();
        this.zeroVec = new Ammo.btVector3(0.0, 0.0, 0.0);
        this.angles.setFromQuaternion(this.parent.Rotation);
        this.UpdateRotation();

        Input.AddMouseMoveListner(this.OnMouseMove);

        document.addEventListener('pointerlockchange', this.OnPointerlockChange);

        Input.AddClickListner(() => {
            if (!this.isLocked) {
                document.body.requestPointerLock();
            }
        });
    }

    OnPointerlockChange = () => {
        this.isLocked = document.pointerLockElement ? true : false;
    }

    OnMouseMove = (event) => {
        if (!this.isLocked) return;

        const { movementX, movementY } = event;

        this.angles.y -= movementX * this.mouseSpeed;
        this.angles.x -= movementY * this.mouseSpeed;
        this.angles.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.angles.x));

        this.UpdateRotation();
    }

    UpdateRotation() {
        this.pitch.setFromAxisAngle(this.xAxis, this.angles.x);
        this.yaw.setFromAxisAngle(this.yAxis, this.angles.y);

        this.parent.Rotation.multiplyQuaternions(this.yaw, this.pitch).normalize();
        this.camera.quaternion.copy(this.parent.Rotation);
    }

    Accelerate(direction, accelerationFactor, t) {
        const accel = this.tempVec.copy(direction).multiplyScalar(accelerationFactor * t);
        this.speed.add(accel);
        this.speed.clampLength(0.0, this.maxSpeed);
    }

    Decelerate(t) {
        const frameDeccel = this.tempVec.copy(this.speed).multiplyScalar(this.decceleration * t);
        this.speed.add(frameDeccel);
    }

    Update(t) {
        const forwardFactor = Input.GetKeyDown("KeyS") - Input.GetKeyDown("KeyW");
        const rightFactor = Input.GetKeyDown("KeyD") - Input.GetKeyDown("KeyA");
        const direction = this.moveDir.set(rightFactor, 0.0, forwardFactor).normalize();

        const velocity = this.physicsBody.getLinearVelocity();
        const isAirborne = !this.physicsComponent.canJump;

        if (Input.GetKeyDown('Space') && this.physicsComponent.canJump) {
            velocity.setY(this.jumpVelocity);
            this.physicsComponent.canJump = false;
        }

        if (!isAirborne) {
            // Ground movement
            this.Decelerate(t);
            this.Accelerate(direction, this.acceleration, t);
        } else {
            // Air strafing
            if (rightFactor !== 0 || forwardFactor !== 0) {
                // Project movement direction onto the plane perpendicular to velocity
                const lateralVelocity = this.tempVec.set(velocity.x(), 0, velocity.z());
                const lateralSpeed = lateralVelocity.length();

                // Adjust control limit based on current air velocity
                const maxAirControl = Math.min(this.maxSpeed - lateralSpeed, this.airAcceleration);
                const airControl = this.tempVec.copy(direction).multiplyScalar(maxAirControl * t);

                velocity.setX(velocity.x() + airControl.x);
                velocity.setZ(velocity.z() + airControl.z);
            }
        }

        const moveVector = this.tempVec.copy(this.speed);
        moveVector.applyQuaternion(this.yaw);

        if (!isAirborne) {
            velocity.setX(moveVector.x);
            velocity.setZ(moveVector.z);
        }

        this.physicsBody.setLinearVelocity(velocity);
        this.physicsBody.setAngularVelocity(this.zeroVec);

        const ms = this.physicsBody.getMotionState();
        if (ms) {
            ms.getWorldTransform(this.transform);
            const p = this.transform.getOrigin();
            this.camera.position.set(p.x(), p.y() + this.yOffset, p.z());
            this.parent.SetPosition(this.camera.position);
        }
    }
}
