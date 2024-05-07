import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';
import { EthernetIPModule } from '../../_models/device';

@Component({
  selector: 'app-device-enipmodule',
  templateUrl: './device-enipmodule.component.html',
  styleUrls: ['./device-enipmodule.component.css']
})
export class DeviceEnipmoduleComponent implements OnInit {

  isToRemove = false;
  private module: EthernetIPModule;
  constructor(private translateService: TranslateService,
    public dialogRef: MatDialogRef<DeviceEnipmoduleComponent>,
		@Inject(MAT_DIALOG_DATA) public data: any) { }

  ngOnInit() {
    this.isToRemove = this.data.remove;
    this.module = this.data.module as EthernetIPModule;
  }
  onNoClick(): void {
		this.dialogRef.close();
	}
  onOkClick(): void {

  }
  isValid(module): boolean {
    return (this.module.name?.length !== 0 &&
      !this.isNullOrNaN(this.module.rpi) &&
      !this.isNullOrNaN(this.module.inputInstance) &&
      !this.isNullOrNaN(this.module.inputSize) &&
      !this.isNullOrNaN(this.module.outputInstance) &&
      !this.isNullOrNaN(this.module.outputSize) &&
      !this.isNullOrNaN(this.module.configurationInstance) &&
      !this.isNullOrNaN(this.module.configurationSize));
  }
  private isNullOrNaN(arg: any) {
    return isNaN(arg) || (arg === null);
  }

}
