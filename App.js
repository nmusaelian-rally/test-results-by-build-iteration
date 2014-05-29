 Ext.define('CustomApp', {
    extend: 'Rally.app.TimeboxScopedApp',
    componentCls: 'app',
    scopeType: 'iteration',
    comboboxConfig: {
        fieldLabel: 'Select Iteration',
        labelWidth: 100,
        width: 300
    },
    
    onScopeChange: function() {
        
        if (!this.down('#parentPanel')) {
            this._panel = Ext.create('Ext.panel.Panel', {
            layout: 'hbox',
            itemId: 'parentPanel',
            componentCls: 'panel',
            items: [
                {
                    xtype: 'container',
                    itemId: 'pickerContainer',
                    flex: 1
                },
                {
                    xtype: 'container',
                    itemId: 'gridContainer',
                    flex: 1
                }
            ]
        });
        this.add(this._panel);
        }
        
       if (this.down('#testSetComboxBox')) {
	    this.down('#testSetComboxBox').destroy();   
	}
	 if (this.down('#myChart')) {
	    this.down('#myChart').destroy();
	 }
          if (this.down('#chartContainer')) {
	    this.down('#chartContainer').destroy();
	 }

            var testSetComboxBox = Ext.create('Rally.ui.combobox.ComboBox',{
	    itemId: 'testSetComboxBox',
	    storeConfig: {
		model: 'TestSet',
		limit: Infinity,
		pageSize: 100,
		autoLoad: true,
		filters: [this.getContext().getTimeboxScope().getQueryFilter()]
	    },
	    fieldLabel: 'Select a TestSet',
	    listeners:{
                ready: function(combobox){
		    if (combobox.getRecord()) {
			this._onTestSetSelected(combobox.getRecord());
		    }
		    else{
			console.log('selected release has no testsets');
			if (this.down('#mygrid')) {
			    this.down('#mygrid').destroy();
			}
		    }
		},
                select: function(combobox){
                    
		    if (combobox.getRecord()) {
                        this._onTestSetSelected(combobox.getRecord());
		    }	        
                },
                scope: this
            }
	});
	this.down('#pickerContainer').add(testSetComboxBox);   
    },
    
     _onTestSetSelected:function(testset){
        var that = this;
        this._filter = Ext.create('Rally.data.wsapi.Filter',  {
                property: 'TestSet',
                value: testset.get('_ref')
	});
        that._filter.toString();
	var _store = Ext.create('Rally.data.WsapiDataStore', {
           model: 'Test Case Result',
	   limit: Infinity,
           fetch: ['ObjectID','Verdict','TestCase','Build'],
           filters: [that._filter],
           sorters:[
            {
	      property: 'Build',
	      direction: 'DESC'
	    }
           ],
           autoLoad: true,
           groupField: 'Build',
           listeners: {
            load: this._onDataLoaded,
            scope: this
            }
       });
     },
     
    _onDataLoaded: function(store, records){
        if ((records.length === 0) && (this._grid)) {
            this._grid.destroy();
        }
        
        var that = this;
        
        var promises = [];
         _.each(records, function(tcr) {
            promises.push(that._getTestCase(tcr, that));
        });

        Deft.Promise.all(promises).then({
            success: function(results) {
                that._testcaseresults = results;
                that._createGrid(records);
            }
        });
    },
    
     _getTestCase: function(tcr, scope) {
        var deferred = Ext.create('Deft.Deferred');
        var that = scope;
        var testcaseOid = tcr.get('TestCase').ObjectID;
        Rally.data.ModelFactory.getModel({
        type: 'Test Case',
        scope: this,
        success: function(model, operation) {
            fetch: ['FormattedID','Name','Method'],
            model.load(testcaseOid, {
                scope: this,
                success: function(record, operation) {
                    var testName = record.get('Name');
                    var testFid = record.get('FormattedID');
                    var testMethod =  record.get('Method');
                    var tcrRef = tcr.get('_ref');
                    var tcrOid  = tcr.get('ObjectID');
                    var tcrVerdict  = tcr.get('Verdict');
                    var tcrBuild = tcr.get('Build');

                    result = {
                        "_ref"          : tcrRef,
                        "ObjectID"      : tcrOid,
                        "Verdict"       : tcrVerdict,
                        "Build"         : tcrBuild,
                        "TestCaseName"      : testName,
                        "TestCaseFormattedID"   : testFid,
                        "Method"    : testMethod   
                    };
                            
                    deferred.resolve(result);    
                }
            });
            }
        });
        return deferred; 
    },
    
    _createGrid: function(records) {
        var that = this;

        if (that._grid) {
            that._grid.destroy();
        }

        var gridStore = Ext.create('Rally.data.custom.Store', {
            data: that._testcaseresults,
            groupField: 'Build'
        });

        that._grid = Ext.create('Rally.ui.grid.Grid', {
            itemId: 'mygrid',
            store: gridStore,
            features: [{ftype:'grouping'}],
            columnCfgs: [
                {
                    text: 'Formatted ID', dataIndex: 'TestCaseFormattedID'
                },
                {
                    text: 'TestCase', dataIndex: 'TestCaseName', 
                },
                {
                    text: 'Method', dataIndex: 'Method', 
                },
                {
                    text: 'Verdict', dataIndex: 'Verdict', 
                }
            ]
        });

        that.down('#gridContainer').add(that._grid);
        that._grid.reconfigure(gridStore);
        that._prepareChart(records);
    },
    
    _prepareChart:function(records){
        console.log('prepare chart');
        var that = this;
        that._series = [];
        that._categories = [];
        var limit = 5;
        
        var passCount = 0;
	var failCount = 0;
        var otherCount = 0;
        var count = 0;
        
        
        var builds = [];
        
        recordsData = [];
        _.each(records, function(record){
            recordsData.push(record.data)
            builds.push(record.data.Build);
        });
        
        
        var uniqueBuilds = _.uniq(builds);
        var size = _.size(uniqueBuilds);
        console.log('uniqueBuilds',uniqueBuilds);
    
         //uncomment to limit to last 5 builds
        //last5uniqueBuilds = _.last(uniqueBuilds, limit)
    

        that._resultsPerBuild = {};
        that._resultsPerBuild = _.object(_.map(uniqueBuilds, function(item) {
            return [item, count]
        }));
        
        var passPerBuild = {};
        var failPerBuild = {};
        var otherPerBuild = {};
        var passData = [];
        var failData = [];
        var otherData = [];
        
        passPerBuild = _.object(_.map(uniqueBuilds, function(item) { //to limit to last 5 builds use last5uniqueBuilds instead of uniqueBuilds
            return [item, count]
        }));
        
        failPerBuild = _.object(_.map(uniqueBuilds, function(item) { //to limit to last 5 builds use last5uniqueBuilds instead of uniqueBuilds
            return [item, count]
        }));
        
        otherPerBuild = _.object(_.map(uniqueBuilds, function(item) { //to limit to last 5 builds use last5uniqueBuilds instead of uniqueBuilds
            return [item, count]
        }));
        
        _.each(recordsData, function(result) { 
            for (k in that._resultsPerBuild){
                    if (k === result.Build) {
                        that._resultsPerBuild[k]++;
                }
            }

            if (result.Verdict === 'Pass') {
                for (k in passPerBuild){
                    if (k === result.Build) {
                        passPerBuild[k]++;
                    }
                }
            }
            else if (result.Verdict === 'Fail') {
                for (k in failPerBuild){
                    if (k === result.Build) {
                        failPerBuild[k]++;
                    }
                }
            }
            else{
                for (k in otherPerBuild){
                    if (k === result.Build) {
                        otherPerBuild[k]++;
                    }
                }
            }
            
        });
        
        for (k in that._resultsPerBuild){
            that._categories.push(k);
        }
        
        for (k in passPerBuild){
            passData.push({build: k, y: passPerBuild[k], color: '#009900'})
        }
        
        for (k in failPerBuild){
            failData.push({build: k, y: failPerBuild[k], color: '#FF0000'})
        }
        
        for (k in otherPerBuild){
            otherData.push({build: k, y: otherPerBuild[k], color: '#FF8000'})
        }

       var allData = [];
       allData.push(passData);
       allData.push(failData);
       allData.push(otherData);
       
      
        that._series.push({
            name: 'Fail',
            data: failData
        })
        that._series.push({
            name: 'Other',
            data: otherData
        })
        that._series.push({
            name: 'Pass',
            data: passData
        })
         
        
        that._makeChart();
    },
    
    _makeChart: function(){
        if (this.down('#myChart')) {
            this.remove('myChart');
        }
        if (this.down('#chartContainer')) {
	    this.down('#chartContainer').destroy();
	}

            this._chart = Ext.create('Rally.ui.chart.Chart', {
            itemId: 'myChart',
            height: 500,
            chartConfig: {
                chart:{
                type: 'column',
                zoomType: 'xy'
                },
                title:{
                    text: 'Results per Build'
                },
                // subtitle:{
                //    text: 'The chart limits number of builds to 5'
                //},
                 plotOptions : {
                    column: {
                    stacking: 'normal'
                    }
                },
                xAxis: {
                    title: {
                        enabled: true,
                        tickInterval: 1,
                        text: 'builds'
                },
                startOnTick: true,
                endOnTick: true,
                showLastLabel: true,
                allowDecimals: false,
                },
                yAxis:{
                    title: {
                        text: 'Results'
                },
                allowDecimals: false
                },
            },
                            
            chartData: { 
                categories: this._categories,
                series: this._series
                
            }
   
        });
        
        this._panel.add({
                    xtype: 'container',
                    itemId: 'chartContainer',
                    flex: 2
        });
        
        this.down('#chartContainer').add(this._chart);
        
        this.down('#myChart')._unmask();
     
    } 
 });
