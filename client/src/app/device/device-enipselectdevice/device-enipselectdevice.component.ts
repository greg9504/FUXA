import { Component, Inject, OnDestroy, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';
import { HmiService } from '../../_services/hmi.service';
import { BehaviorSubject, Observable, Subject, takeUntil } from 'rxjs';

interface browserDevice  {
  EncapsulationVersion: number;
  socketAddress: {
      sin_family: number;
      sin_port: number;
      sin_addr: string;
      sin_zero: ArrayBuffer;
  };
  vendorID: number;
  deviceType: number;
  productCode: number;
  revision: string;
  status: number;
  serialNumber: string;
  productName: string;
  state: number;
  timestamp: number;
};
@Component({
  selector: 'app-device-enipselectdevice',
  templateUrl: './device-enipselectdevice.component.html',
  styleUrls: ['./device-enipselectdevice.component.css']
})
export class DeviceEnipselectdeviceComponent implements OnInit, OnDestroy {


  error$: Observable<string>;
  isDevicesLoading: boolean = true;
  devices: browserDevice[] = [];
  private _error$ = new BehaviorSubject('');
  private _error: string = '';
  private destroy$ = new Subject<void>();
  private selectedDevice: browserDevice = undefined;

  constructor(private translateService: TranslateService,
    private hmiService: HmiService,
    public dialogRef: MatDialogRef<DeviceEnipselectdeviceComponent>,
		@Inject(MAT_DIALOG_DATA) public data: any) {
      this.error$ = this._error$.asObservable();
     }

  ngOnInit() {
    //listen for browsing of ethernet/ip devices
    this.hmiService.onBrowseForDevices.pipe(
      takeUntil(this.destroy$),
    ).subscribe(values => {
        try {
          if (values.error) {
            console.log(values.error);
            if (values?.error === 'Device not found!') {
              this._error = 'Device not enabled, unable to retrieve tags.  Enable device.';
            } else {
              this._error = values.error;
            }
            this._error$.next(this._error);
          } else {
           // console.log(values);
            this.devices = values.result;
            if (this.devices.length > 0) {
              this.selectedDevice = this.devices[0];
            }
          }
        } catch (error) {
          this._error = error.toString();
          this._error$.next(this._error);
        }
        finally {
          this.isDevicesLoading = false;
        }
    });
    this.isDevicesLoading = true;
    this.hmiService.askBrowseForDevices('getEthernetIpDevices', null);
  }
  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
  onNoClick(): void {
		this.dialogRef.close();
	}
  onOkClick(): void {
    this.dialogRef.close(this.selectedDevice);
  }
  isValid(): boolean {
    return !this.isDevicesLoading  && !this.hasError();
  }
  onSelectDevice(device: browserDevice) {
    this.selectedDevice = device;
  }
  hasError(): boolean {
    return this._error?.length > 0;
  }
}
