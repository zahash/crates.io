import { action } from '@ember/object';
import { inject as service } from '@ember/service';
import { waitForPromise } from '@ember/test-waiters';
import Component from '@glimmer/component';

import subDays from 'date-fns/subDays';
import window from 'ember-window-mock';
import semverSort from 'semver/functions/sort';

// Colors by http://colorbrewer2.org/#type=diverging&scheme=RdBu&n=10
const COLORS = ['#67001f', '#b2182b', '#d6604d', '#f4a582', '#92c5de', '#4393c3', '#2166ac', '#053061'];
const BG_COLORS = ['#d3b5bc', '#eabdc0', '#f3d0ca', '#fce4d9', '#deedf5', '#c9deed', '#2166ac', '#053061'];

export default class DownloadGraph extends Component {
  @service chartjs;

  @action loadChartJs() {
    waitForPromise(this.chartjs.loadTask.perform()).catch(() => {
      // Ignore Promise rejections. We'll handle them through the derived state properties.
    });
  }

  @action createChart(element) {
    let Chart = this.chartjs.loadTask.lastSuccessful.value;

    this.chart = new Chart(element, {
      type: 'line',
      data: this.data,
      options: {
        maintainAspectRatio: false,
        layout: {
          padding: 10,
        },
        scales: {
          xAxes: [{ type: 'time', time: { stepSize: 7, tooltipFormat: 'MMM d', unit: 'day' } }],
          yAxes: [{ stacked: true, ticks: { min: 0, precision: 0 } }],
        },
        tooltips: {
          mode: 'index',
          intersect: false,
          position: 'nearest',
        },
      },
    });
  }

  @action updateChart() {
    let { chart, animate } = this.chart;

    if (chart) {
      chart.data = this.data;

      if (animate) {
        chart.update();
      } else {
        chart.update(0);
      }
    }
  }

  @action destroyChart() {
    this.chart?.destroy();
  }

  @action reloadPage() {
    window.location.reload();
  }

  get data() {
    let downloads = this.args.data;
    if (!downloads) {
      return { datasets: [] };
    }

    let extra = downloads.content?.meta?.extra_downloads ?? [];

    let dates = {};
    let versions = new Set([]);

    let now = new Date();
    for (let i = 0; i < 90; i++) {
      let date = subDays(now, i);
      dates[date.toISOString().slice(0, 10)] = { date, cnt: {} };
    }

    downloads.forEach(d => {
      let version_num = d.version.num;

      versions.add(version_num);

      let key = d.date;
      if (dates[key]) {
        let prev = dates[key].cnt[version_num] || 0;
        dates[key].cnt[version_num] = prev + d.downloads;
      }
    });

    extra.forEach(d => {
      let key = d.date;
      if (dates[key]) {
        let prev = dates[key].cnt['Other'] || 0;
        dates[key].cnt['Other'] = prev + d.downloads;
      }
    });

    let versionsList = semverSort([...versions]);
    if (extra.length !== 0) {
      versionsList.unshift('Other');
    }

    let rows = Object.keys(dates).map(date => [
      dates[date].date,
      ...versionsList.map(version => dates[date].cnt[version] || 0),
    ]);

    let datasets = versionsList
      .map((label, index) => ({
        data: rows.map(row => ({ x: row[0], y: row[index + 1] })),
        label: label,
      }))
      .reverse()
      .map(({ label, data }, index) => {
        return {
          backgroundColor: BG_COLORS[index],
          borderColor: COLORS[index],
          borderWidth: 2,
          cubicInterpolationMode: 'monotone',
          data: data,
          label: label,
          pointHoverBorderWidth: 2,
          pointHoverRadius: 5,
        };
      });

    return { datasets };
  }
}
